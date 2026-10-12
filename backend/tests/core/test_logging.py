"""Logging técnico (ADR-0002, T22, QA-04): sin datos sensibles, asíncrono y tolerante a fallos.

Firestore se sustituye por un doble en memoria: las pruebas nunca escriben en Firebase.
"""

import logging
import threading

import pytest

from apps.core.context import RequestContext, reset_context, set_context
from apps.core.logging.filters import REDACTED, RequestContextFilter, SensitiveDataFilter
from apps.core.logging.firestore import (
    FirestoreEventFilter,
    FirestoreLogHandler,
    OwnTrafficFilter,
    start_firestore_logging,
    stop_firestore_logging,
)

SECRETS = {
    "password": "hunter2-secret",
    "max_amount": "987.65",
    "reserve_price": "555.55",
    "candle_seed": "deadbeefseed",
    "sealed_amount": "321.09",
    "cookie": "sessionid=abc123cookie",
    "authorization": "Bearer tok-xyz",
    "email": "ana@example.com",
}


class FakeFirestore:
    """Doble del cliente de Firestore: guarda los documentos de cada commit."""

    def __init__(self, fail_times: int = 0):
        self.docs: list[dict] = []
        self.commits = 0
        self.fail_times = fail_times
        self.written = threading.Event()

    def collection(self, name):
        self.collection_name = name
        return self

    def document(self):
        return object()

    def batch(self):
        fake = self
        pending: list[dict] = []

        class Batch:
            def set(self, _ref, doc):
                pending.append(doc)

            def commit(self):
                if fake.fail_times > 0:
                    fake.fail_times -= 1
                    raise ConnectionError("firestore caído")
                fake.docs.extend(pending)
                fake.commits += 1
                fake.written.set()

        return Batch()


def make_record(level=logging.WARNING, msg="Puja rechazada", extra=None, exc_info=None):
    record = logging.LogRecord("lancex.bids", level, __file__, 10, msg, (), exc_info)
    for key, value in (extra or {}).items():
        setattr(record, key, value)
    return record


class TestSensitiveDataFilter:
    def test_removes_sensitive_extra_keys(self):
        record = make_record(extra={**SECRETS, "event": "bid_rejected", "auction_id": "a-1"})
        assert SensitiveDataFilter().filter(record) is True
        for key in SECRETS:
            assert not hasattr(record, key), key
        assert record.event == "bid_rejected"
        assert record.auction_id == "a-1"

    def test_redacts_nested_structures(self):
        record = make_record(extra={"context": {"user": {"password": "x", "display_name": "Ana"}, "tokens": ["t"]}})
        SensitiveDataFilter().filter(record)
        assert record.context == {"user": {"password": REDACTED, "display_name": "Ana"}, "tokens": REDACTED}

    def test_masks_emails_in_message_and_args(self):
        record = logging.LogRecord(
            "lancex", logging.WARNING, __file__, 1, "Login fallido de %s", ("ana@example.com",), None
        )
        SensitiveDataFilter().filter(record)
        assert "ana@example.com" not in record.getMessage()
        assert REDACTED in record.getMessage()


class TestRequestContextFilter:
    def test_injects_current_request_context(self):
        token = set_context(RequestContext(request_id="rid-1", user_id="u-1", method="POST", path="/api/v1/x/"))
        try:
            record = make_record()
            RequestContextFilter().filter(record)
        finally:
            reset_context(token)
        assert (record.request_id, record.user_id, record.method, record.path) == ("rid-1", "u-1", "POST", "/api/v1/x/")

    def test_outside_a_request_uses_placeholder(self):
        record = make_record()
        RequestContextFilter().filter(record)
        assert record.request_id == "-"


class TestFirestoreEventFilter:
    def test_only_warning_or_allowlisted_info_events(self):
        f = FirestoreEventFilter(logging.WARNING)
        assert f.filter(make_record(logging.WARNING))
        assert f.filter(make_record(logging.ERROR))
        assert not f.filter(make_record(logging.INFO))
        assert f.filter(make_record(logging.INFO, extra={"event": "request_completed"}))
        assert not f.filter(make_record(logging.INFO, extra={"event": "something_else"}))


class TestFirestoreLogHandler:
    def handler(self, fake, batch_size=20):
        return FirestoreLogHandler(
            client_factory=lambda: fake, collection="logs_tecnicos", dev="nicolay", env="local", batch_size=batch_size
        )

    def test_document_follows_adr_schema_allowlist(self):
        fake = FakeFirestore()
        h = self.handler(fake)
        record = make_record(
            extra={**SECRETS, "event": "bid_rejected", "status": 409, "error_code": "BID_BELOW_MINIMUM"}
        )
        record.request_id = "rid-1"
        h.emit(record)
        h.flush()
        (doc,) = fake.docs
        assert fake.collection_name == "logs_tecnicos"
        assert doc["dev"] == "nicolay" and doc["env"] == "local"
        assert doc["request_id"] == "rid-1"
        assert doc["error_code"] == "BID_BELOW_MINIMUM"
        assert (doc["expire_at"] - doc["ts"]).days == 30
        for value in SECRETS.values():
            assert value not in repr(doc)  # aunque no pase por SensitiveDataFilter: lista blanca

    def test_exception_is_summarized_without_its_message(self):
        try:
            raise ValueError("SELECT max_amount FROM proxy_bid_limit -- 987.65")
        except ValueError:
            import sys

            record = make_record(logging.ERROR, exc_info=sys.exc_info())
        fake = FakeFirestore()
        h = self.handler(fake)
        h.emit(record)
        h.flush()
        summary = fake.docs[0]["exception"]
        assert summary.startswith("ValueError at ")
        assert "987.65" not in summary and "SELECT" not in summary

    def test_flushes_automatically_at_batch_size(self):
        fake = FakeFirestore()
        h = self.handler(fake, batch_size=3)
        for _ in range(7):
            h.emit(make_record())
        assert fake.commits == 2 and len(fake.docs) == 6
        h.flush()
        assert len(fake.docs) == 7

    def test_retries_once_then_succeeds(self):
        fake = FakeFirestore(fail_times=1)
        h = self.handler(fake)
        h.emit(make_record())
        h.flush()
        assert len(fake.docs) == 1

    def test_drops_batch_after_second_failure_without_raising(self, capsys):
        fake = FakeFirestore(fail_times=2)
        h = self.handler(fake)
        h.emit(make_record())
        h.flush()  # no lanza: un log nunca rompe la aplicación (QA-04)
        assert fake.docs == []
        assert "descartado" in capsys.readouterr().err


class TestAsyncPipeline:
    @pytest.fixture
    def test_logger(self):
        logger = logging.getLogger("lancex.test_pipeline")
        logger.setLevel(logging.INFO)
        logger.propagate = False
        yield logger
        stop_firestore_logging(logger)

    def config(self, enabled=True):
        return {"ENABLED": enabled, "MIN_LEVEL": "WARNING", "COLLECTION": "logs_tecnicos", "FLUSH_INTERVAL_S": 0.05}

    def test_warning_reaches_firestore_without_sensitive_data(self, test_logger):
        fake = FakeFirestore()
        listener = start_firestore_logging(
            self.config(), dev="nicolay", env="local", client_factory=lambda: fake, logger=test_logger
        )
        assert listener is not None
        token = set_context(RequestContext(request_id="rid-42", user_id="u-1", method="POST", path="/api/v1/bids/"))
        try:
            test_logger.warning("Log de prueba de ana@example.com", extra={**SECRETS, "event": "diagnostic_test"})
            test_logger.info("info sin evento: no se envía")
        finally:
            reset_context(token)

        assert fake.written.wait(timeout=5), "el listener no vació el lote por tiempo"
        stop_firestore_logging(test_logger)
        (doc,) = fake.docs
        assert doc["level"] == "WARNING"
        assert doc["event"] == "diagnostic_test"
        assert doc["request_id"] == "rid-42"
        assert doc["path"] == "/api/v1/bids/"
        for value in SECRETS.values():
            assert value not in repr(doc)

    def test_logging_does_not_block_when_firestore_is_down(self, test_logger):
        fake = FakeFirestore(fail_times=10**6)
        start_firestore_logging(self.config(), dev="d", env="local", client_factory=lambda: fake, logger=test_logger)
        for _ in range(100):
            test_logger.error("error")  # solo encola; nunca lanza
        stop_firestore_logging(test_logger)
        assert fake.docs == []

    def test_disabled_means_no_handler_and_app_keeps_working(self, test_logger):
        before = list(test_logger.handlers)
        assert start_firestore_logging(self.config(enabled=False), dev="d", env="local", logger=test_logger) is None
        assert test_logger.handlers == before
        test_logger.warning("solo consola")


def test_test_settings_never_enable_firestore(settings):
    assert settings.FIRESTORE_LOGS["ENABLED"] is False


def test_enabled_without_credentials_falls_back_to_console(capsys):
    config = {"ENABLED": True, "CREDENTIALS_PATH": ""}
    assert start_firestore_logging(config, dev="d", env="local", logger=logging.getLogger("lancex.nocreds")) is None
    assert "solo consola" in capsys.readouterr().err


def test_logs_from_the_firestore_client_are_not_sent_back():
    class FakeListener:
        _thread = threading.current_thread()

    own = OwnTrafficFilter(FakeListener())
    assert not own.filter(make_record())  # emitido desde el hilo del listener

    other = OwnTrafficFilter(type("L", (), {"_thread": None})())
    assert not other.filter(logging.LogRecord("google.api_core.retry", logging.WARNING, "", 0, "x", (), None))
    assert other.filter(make_record())
