"""Envío asíncrono de logs técnicos a Firestore (ADR-0002).

Arquitectura productor-consumidor:

    hilo de la petición ──QueueHandler──▶ cola en memoria ──▶ BatchingQueueListener (hilo)
                                                                └─▶ FirestoreLogHandler (lotes)

- La petición solo encola: un log nunca bloquea ni hace fallar una puja (QA-04).
- El listener vacía el lote cada `batch_size` registros o cada `flush_interval_s` segundos.
- Si Firestore falla: un reintento y luego se descarta el lote (aviso solo por stderr).
- El documento se construye con lista blanca de campos (esquema de ADR-0002): ningún `extra`
  arbitrario llega a Firestore aunque alguien lo agregue a un log.
"""

from __future__ import annotations

import contextlib
import copy
import logging
import queue
import sys
import threading
import traceback
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from logging.handlers import QueueHandler, QueueListener
from pathlib import PurePath
from typing import Any

from .filters import mask_emails

# Eventos INFO que sí se envían (además de todo lo >= MIN_LEVEL).
FIRESTORE_INFO_EVENTS = frozenset({"request_completed", "auction_closed", "close_job_run"})

# Campos opcionales permitidos en el documento (lista blanca). Los de seguridad (`reason`,
# `capability`, `fields`, `view`, `serializer`) son nombres, nunca valores enviados por el usuario.
_ALLOWED_EXTRA = (
    "method",
    "path",
    "status",
    "duration_ms",
    "error_code",
    "auction_id",
    "user_id",
    "reason",
    "capability",
    "fields",
    "view",
    "serializer",
)
_MAX_MESSAGE = 500


class FirestoreEventFilter(logging.Filter):
    """Deja pasar nivel >= min_level o un evento INFO de la lista cerrada (cuota de Firestore)."""

    def __init__(self, min_level: int) -> None:
        super().__init__()
        self.min_level = min_level

    def filter(self, record: logging.LogRecord) -> bool:
        return record.levelno >= self.min_level or getattr(record, "event", None) in FIRESTORE_INFO_EVENTS


class OwnTrafficFilter(logging.Filter):
    """Evita el bucle: no se envían a Firestore los logs que genera el propio envío a Firestore."""

    CLIENT_LOGGERS = ("google", "grpc", "urllib3", "firebase_admin", "cachecontrol")

    def __init__(self, listener: QueueListener) -> None:
        super().__init__()
        self.listener = listener

    def filter(self, record: logging.LogRecord) -> bool:
        thread = getattr(self.listener, "_thread", None)
        if thread is not None and record.thread == thread.ident:
            return False
        return not record.name.startswith(self.CLIENT_LOGGERS)


def summarize_exception(record: logging.LogRecord) -> str | None:
    """Tipo de excepción y últimos marcos (archivo:línea función), sin el mensaje.

    El mensaje de una excepción puede contener datos (SQL con parámetros, importes): no se envía.
    """
    if not record.exc_info or not record.exc_info[0]:
        return None
    exc_type, _, tb = record.exc_info
    frames = traceback.extract_tb(tb)[-3:]
    where = " <- ".join(f"{PurePath(f.filename).name}:{f.lineno} {f.name}" for f in reversed(frames))
    return f"{exc_type.__name__} at {where}" if where else exc_type.__name__


def build_document(record: logging.LogRecord, *, dev: str, env: str, ttl_days: int) -> dict[str, Any]:
    ts = datetime.fromtimestamp(record.created, tz=UTC)
    request_id = getattr(record, "request_id", None)
    doc: dict[str, Any] = {
        "ts": ts,
        "level": record.levelname,
        "logger": record.name,
        "event": getattr(record, "event", None),
        "message": mask_emails(record.getMessage())[:_MAX_MESSAGE],
        "dev": dev,
        "env": env,
        "request_id": None if request_id in (None, "-") else request_id,
        "exception": getattr(record, "exception_summary", None) or summarize_exception(record),
        "expire_at": ts + timedelta(days=ttl_days),
    }
    for key in _ALLOWED_EXTRA:
        doc[key] = getattr(record, key, None)
    return doc


class FirestoreLogHandler(logging.Handler):
    """Acumula documentos y los escribe en lote. Solo se ejecuta en el hilo del listener."""

    def __init__(
        self,
        *,
        client_factory: Callable[[], Any],
        collection: str,
        dev: str,
        env: str,
        ttl_days: int = 30,
        batch_size: int = 20,
    ) -> None:
        super().__init__()
        self._client_factory = client_factory
        self._client = None
        self.collection = collection
        self.dev = dev
        self.env = env
        self.ttl_days = ttl_days
        self.batch_size = batch_size
        self._buffer: list[dict[str, Any]] = []

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self._buffer.append(build_document(record, dev=self.dev, env=self.env, ttl_days=self.ttl_days))
        except Exception:  # noqa: BLE001 - un log mal formado nunca rompe el listener
            self._warn("registro descartado al construir el documento")
            return
        if len(self._buffer) >= self.batch_size:
            self.flush()

    def flush(self) -> None:
        if not self._buffer:
            return
        batch, self._buffer = self._buffer, []
        for attempt in (1, 2):
            try:
                self._write(batch)
                return
            except Exception as exc:  # noqa: BLE001
                if attempt == 2:
                    self._warn(f"lote de {len(batch)} logs descartado ({type(exc).__name__})")

    def _write(self, batch: list[dict[str, Any]]) -> None:
        if self._client is None:
            self._client = self._client_factory()
        collection = self._client.collection(self.collection)
        writer = self._client.batch()
        for doc in batch:
            writer.set(collection.document(), doc)
        writer.commit()

    @staticmethod
    def _warn(message: str) -> None:
        # stderr directo: usar logging aquí provocaría recursión hacia este mismo handler.
        sys.stderr.write(f"[lancex.firestore] {message}\n")


class BatchingQueueListener(QueueListener):
    """QueueListener que, si la cola queda inactiva `flush_interval_s`, vacía los lotes."""

    def __init__(self, log_queue, *handlers, flush_interval_s: float = 2.0) -> None:
        super().__init__(log_queue, *handlers, respect_handler_level=True)
        self.flush_interval_s = flush_interval_s

    def dequeue(self, block: bool):
        while True:
            try:
                return self.queue.get(block=block, timeout=self.flush_interval_s if block else None)
            except queue.Empty:
                if not block:
                    raise
                self.flush_handlers()

    def flush_handlers(self) -> None:
        for handler in self.handlers:
            handler.flush()

    def stop(self) -> None:
        super().stop()  # procesa lo pendiente en la cola
        self.flush_handlers()


def default_client_factory(project_id: str, credentials_path: str) -> Callable[[], Any]:
    """Crea el cliente del Admin SDK de forma perezosa (en el hilo del listener)."""

    def factory():
        import firebase_admin
        from firebase_admin import credentials, firestore

        app_name = "lancex-logs"
        try:
            app = firebase_admin.get_app(app_name)
        except ValueError:
            cred = credentials.Certificate(credentials_path) if credentials_path else credentials.ApplicationDefault()
            app = firebase_admin.initialize_app(cred, {"projectId": project_id} if project_id else None, name=app_name)
        return firestore.client(app)

    return factory


_lock = threading.Lock()
_listener: BatchingQueueListener | None = None


def start_firestore_logging(
    config: dict[str, Any],
    *,
    dev: str,
    env: str,
    client_factory: Callable[[], Any] | None = None,
    logger: logging.Logger | None = None,
) -> BatchingQueueListener | None:
    """Engancha QueueHandler al logger raíz y arranca el listener. Idempotente."""
    global _listener
    if not config.get("ENABLED"):
        return None
    if client_factory is None and not config.get("CREDENTIALS_PATH"):
        # Sin credencial explícita el SDK sondea los metadatos de GCP: lento e inútil en una laptop.
        FirestoreLogHandler._warn("FIRESTORE_LOGS_ENABLED=true sin GOOGLE_APPLICATION_CREDENTIALS: solo consola.")
        return None
    with _lock:
        if _listener is not None:
            return _listener

        from .filters import RequestContextFilter, SensitiveDataFilter

        min_level = logging.getLevelName(str(config.get("MIN_LEVEL", "WARNING")).upper())
        handler = FirestoreLogHandler(
            client_factory=client_factory
            or default_client_factory(config.get("PROJECT_ID", ""), config.get("CREDENTIALS_PATH", "")),
            collection=config.get("COLLECTION", "logs_tecnicos"),
            dev=dev,
            env=env,
            ttl_days=int(config.get("TTL_DAYS", 30)),
            batch_size=int(config.get("BATCH_SIZE", 20)),
        )

        log_queue: queue.Queue = queue.Queue(maxsize=10_000)
        queue_handler = _DroppingQueueHandler(log_queue)
        listener = BatchingQueueListener(
            log_queue, handler, flush_interval_s=float(config.get("FLUSH_INTERVAL_S", 2.0))
        )
        # Filtros en el hilo de la petición: el contexto (request_id) vive en ese hilo.
        queue_handler.addFilter(OwnTrafficFilter(listener))
        queue_handler.addFilter(FirestoreEventFilter(min_level))
        queue_handler.addFilter(RequestContextFilter())
        queue_handler.addFilter(SensitiveDataFilter())
        listener.start()
        (logger or logging.getLogger()).addHandler(queue_handler)
        listener.queue_handler = queue_handler
        _listener = listener
        return listener


def stop_firestore_logging(logger: logging.Logger | None = None) -> None:
    global _listener
    with _lock:
        if _listener is None:
            return
        (logger or logging.getLogger()).removeHandler(_listener.queue_handler)
        _listener.stop()
        _listener = None


class _DroppingQueueHandler(QueueHandler):
    """Encola una copia segura del registro; si la cola está llena, la descarta sin bloquear."""

    def prepare(self, record: logging.LogRecord) -> logging.LogRecord:
        # La versión de la stdlib borra exc_info: resumimos la excepción aquí, en el hilo de origen.
        prepared = copy.copy(record)
        prepared.exception_summary = summarize_exception(record)
        prepared.msg = record.getMessage()
        prepared.args = ()
        prepared.exc_info = None
        prepared.exc_text = None
        return prepared

    def enqueue(self, record: logging.LogRecord) -> None:
        with contextlib.suppress(queue.Full):
            self.queue.put_nowait(record)
