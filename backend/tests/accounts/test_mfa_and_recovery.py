"""Doble factor (TOTP + códigos de respaldo) y restablecimiento de contraseña emitido por un admin.

Contra PostgreSQL local con la migración `20261014120000_doble_factor_y_reset.sql`.
"""

import base64
from datetime import UTC, datetime, timedelta

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.models import MfaRecoveryCode, PasswordResetToken, UserMfa
from apps.accounts.services import totp
from apps.audit.models import AuditEvent
from apps.core.time import time_source
from tests.auctions.helpers import PASSWORD, make_user

NEW_PASSWORD = "Otra-Clave-Larga-456"


# --- TOTP puro (RFC 6238, apéndice B, recortado a 6 dígitos) ---------------------------------


@pytest.mark.parametrize(
    ("unix_time", "expected"),
    [(59, "287082"), (1111111109, "081804"), (1234567890, "005924"), (2000000000, "279037")],
)
def test_totp_matches_rfc_6238_vectors(unix_time, expected):
    secret = base64.b32encode(b"12345678901234567890").decode()
    assert totp.code_at(secret, totp.step_of(datetime.fromtimestamp(unix_time, UTC))) == expected


def test_totp_accepts_one_step_of_drift_and_rejects_replays():
    secret = totp.new_secret()
    now = datetime(2026, 10, 14, 12, 0, tzinfo=UTC)
    step = totp.step_of(now)
    assert totp.matching_step(secret, totp.code_at(secret, step - 1), now) == step - 1
    assert totp.matching_step(secret, totp.code_at(secret, step + 2), now) is None
    assert totp.matching_step(secret, totp.code_at(secret, step), now, after=step) is None
    assert totp.matching_step(secret, "12ab56", now) is None


def test_recovery_codes_are_distinct_and_readable():
    codes = totp.new_recovery_codes()
    assert len(set(codes)) == totp.RECOVERY_CODES
    assert all(len(c) == 19 and c.count("-") == 3 for c in codes)
    assert totp.normalize_recovery_code(codes[0].lower()) == codes[0].replace("-", "")


# --- Flujo HTTP ----------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _relaxed(monkeypatch):
    for scope in ("login", "mfa", "password_reset"):
        monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, scope, "1000/min")
    cache.clear()  # bloqueo de login por cuenta


def code_for(user, *, ahead: int = 1) -> str:
    """Código del paso siguiente (el actual ya pudo usarse: anti-repetición)."""
    secret = UserMfa.objects.get(user_id=user.pk).secret
    return totp.code_at(secret, totp.step_of(time_source.db_now()) + ahead)


def logged_in(user, password=PASSWORD) -> APIClient:
    client = APIClient()
    assert (
        client.post("/api/v1/auth/login/", {"email": user.email, "password": password}, format="json").status_code
        == 200
    )
    return client


def enable_mfa(user) -> list[str]:
    client = logged_in(user)
    setup = client.post("/api/v1/auth/mfa/setup/", {"password": PASSWORD}, format="json")
    assert setup.status_code == 200, setup.content
    secret = setup.json()["secret"]
    code = totp.code_at(secret, totp.step_of(time_source.db_now()))
    enabled = client.post("/api/v1/auth/mfa/enable/", {"code": code}, format="json")
    assert enabled.status_code == 201, enabled.content
    return enabled.json()["recovery_codes"]


def login_first_step(user, password=PASSWORD) -> APIClient:
    client = APIClient()
    response = client.post("/api/v1/auth/login/", {"email": user.email, "password": password}, format="json")
    assert response.status_code == 200, response.content
    assert response.json() == {"mfa_required": True}
    return client


@pytest.mark.django_db
class TestMfaSetup:
    def test_setup_requires_password_and_enable_requires_a_valid_code(self):
        user = make_user()
        client = logged_in(user)
        wrong = client.post("/api/v1/auth/mfa/setup/", {"password": "mala"}, format="json")
        assert wrong.status_code == 403 and wrong.json()["code"] == "STEP_UP_FAILED"
        assert client.post("/api/v1/auth/mfa/enable/", {"code": "123456"}, format="json").json()["code"] == (
            "MFA_SETUP_REQUIRED"
        )

        setup = client.post("/api/v1/auth/mfa/setup/", {"password": PASSWORD}, format="json")
        assert setup.status_code == 200 and setup["Cache-Control"] == "no-store"
        body = setup.json()
        assert body["otpauth_uri"].startswith("otpauth://totp/LANCEX%3A") and body["secret"] in body["otpauth_uri"]
        assert not UserMfa.objects.filter(user_id=user.pk).exists()  # aún no se guardó

        bad = client.post("/api/v1/auth/mfa/enable/", {"code": "000000"}, format="json")
        assert bad.status_code == 400
        code = totp.code_at(body["secret"], totp.step_of(time_source.db_now()))
        ok = client.post("/api/v1/auth/mfa/enable/", {"code": code}, format="json")
        assert ok.status_code == 201 and len(ok.json()["recovery_codes"]) == 10

        status = client.get("/api/v1/auth/mfa/").json()
        assert status["enabled"] is True and status["recovery_codes_remaining"] == 10
        assert "secret" not in status
        again = client.post("/api/v1/auth/mfa/setup/", {"password": PASSWORD}, format="json")
        assert again.status_code == 409 and again.json()["code"] == "MFA_ALREADY_ENABLED"

    def test_only_hashes_are_stored_and_audit_has_no_secrets(self):
        user = make_user()
        codes = enable_mfa(user)
        stored = set(MfaRecoveryCode.objects.filter(user_id=user.pk).values_list("code_hash", flat=True))
        assert not any(c.replace("-", "") in h or c in h for c in codes for h in stored)
        assert stored == {totp.hash_secret_value(totp.normalize_recovery_code(c)) for c in codes}
        event = AuditEvent.objects.get(entity_id=user.pk, action="security_mfa_enabled")
        assert event.data == {}


@pytest.mark.django_db
class TestMfaLogin:
    def test_password_alone_does_not_log_in(self):
        user = make_user()
        enable_mfa(user)
        client = login_first_step(user)
        assert client.get("/api/v1/auth/me/").status_code == 401

        wrong = client.post("/api/v1/auth/login/mfa/", {"code": "000000"}, format="json")
        assert wrong.status_code == 401 and wrong.json()["code"] == "INVALID_MFA_CODE"
        ok = client.post("/api/v1/auth/login/mfa/", {"code": code_for(user)}, format="json")
        assert ok.status_code == 200 and ok.json()["id"] == str(user.pk)
        assert client.get("/api/v1/auth/me/").status_code == 200

    def test_a_totp_code_cannot_be_replayed(self):
        user = make_user()
        enable_mfa(user)
        code = code_for(user)
        assert login_first_step(user).post("/api/v1/auth/login/mfa/", {"code": code}, format="json").status_code == 200
        replay = login_first_step(user).post("/api/v1/auth/login/mfa/", {"code": code}, format="json")
        assert replay.status_code == 401

    def test_recovery_code_works_once(self):
        user = make_user()
        codes = enable_mfa(user)
        first = login_first_step(user).post("/api/v1/auth/login/mfa/", {"code": codes[0].lower()}, format="json")
        assert first.status_code == 200
        second = login_first_step(user).post("/api/v1/auth/login/mfa/", {"code": codes[0]}, format="json")
        assert second.status_code == 401
        assert AuditEvent.objects.filter(entity_id=user.pk, action="security_mfa_recovery_code_used").count() == 1
        assert logged_in_with_mfa(user).get("/api/v1/auth/mfa/").json()["recovery_codes_remaining"] == 9

    def test_without_a_pending_login_the_second_step_is_rejected(self):
        response = APIClient().post("/api/v1/auth/login/mfa/", {"code": "123456"}, format="json")
        assert response.status_code == 401 and response.json()["code"] == "MFA_SESSION_EXPIRED"

    def test_five_wrong_codes_lock_the_account(self):
        user = make_user()
        enable_mfa(user)
        client = login_first_step(user)
        for _ in range(5):
            client.post("/api/v1/auth/login/mfa/", {"code": "000000"}, format="json")
        locked = APIClient().post("/api/v1/auth/login/", {"email": user.email, "password": PASSWORD}, format="json")
        assert locked.status_code == 429


def logged_in_with_mfa(user) -> APIClient:
    client = login_first_step(user)
    assert client.post("/api/v1/auth/login/mfa/", {"code": code_for(user, ahead=1)}, format="json").status_code == 200
    return client


@pytest.mark.django_db
class TestMfaManagement:
    def test_disable_requires_password_and_code(self):
        user = make_user()
        codes = enable_mfa(user)
        client = logged_in_with_mfa(user)
        bad = client.post("/api/v1/auth/mfa/disable/", {"password": PASSWORD, "code": "000000"}, format="json")
        assert bad.status_code == 403
        ok = client.post("/api/v1/auth/mfa/disable/", {"password": PASSWORD, "code": codes[1]}, format="json")
        assert ok.status_code == 204
        assert not UserMfa.objects.filter(user_id=user.pk).exists()
        assert not MfaRecoveryCode.objects.filter(user_id=user.pk).exists()
        assert "id" in logged_in(user).get("/api/v1/auth/me/").json()  # vuelve al login de un paso

    def test_regenerating_recovery_codes_invalidates_the_old_ones(self):
        user = make_user()
        old = enable_mfa(user)
        client = logged_in_with_mfa(user)
        new = client.post(
            "/api/v1/auth/mfa/recovery-codes/", {"password": PASSWORD, "code": old[2]}, format="json"
        ).json()["recovery_codes"]
        assert set(new).isdisjoint(old)
        assert (
            login_first_step(user).post("/api/v1/auth/login/mfa/", {"code": old[3]}, format="json").status_code == 401
        )
        assert (
            login_first_step(user).post("/api/v1/auth/login/mfa/", {"code": new[0]}, format="json").status_code == 200
        )


# --- Restablecimiento por admin ------------------------------------------------------------


def issue(admin, target, password=PASSWORD, reason="Olvidó su contraseña"):
    client = APIClient()
    client.force_authenticate(admin)
    return client.post(
        f"/api/v1/admin/users/{target.pk}/password-reset/", {"reason": reason, "password": password}, format="json"
    )


def confirm(token, new_password=NEW_PASSWORD):
    return APIClient().post(
        "/api/v1/auth/password-reset/", {"token": token, "new_password": new_password}, format="json"
    )


@pytest.mark.django_db
class TestAdminPasswordReset:
    def test_full_flow(self):
        admin, user = make_user("admin"), make_user()
        old_session = logged_in(user)

        response = issue(admin, user)
        assert response.status_code == 201 and response["Cache-Control"] == "no-store"
        token = response.json()["token"]
        assert response.json()["reset_path"].endswith(token)
        assert not PasswordResetToken.objects.filter(token_hash=token).exists()  # solo el hash

        weak = confirm(token, "123")
        assert weak.status_code == 400  # contraseña débil: el enlace sigue vigente
        assert confirm(token).status_code == 204
        assert confirm(token).status_code == 400  # un solo uso

        assert old_session.get("/api/v1/auth/me/").status_code == 401  # sesiones revocadas
        bad = APIClient().post("/api/v1/auth/login/", {"email": user.email, "password": PASSWORD}, format="json")
        assert bad.status_code == 401
        assert logged_in(user, NEW_PASSWORD).get("/api/v1/auth/me/").status_code == 200

        issued = AuditEvent.objects.get(entity_id=user.pk, action="security_password_reset_issued")
        assert token not in str(issued.data) and issued.actor_user_id == admin.pk
        assert AuditEvent.objects.filter(actor_user_id=user.pk, action="security_password_reset_completed").exists()

    def test_requires_step_up_and_never_on_oneself(self):
        admin, user = make_user("admin"), make_user()
        assert issue(admin, user, password="mala").json()["code"] == "STEP_UP_FAILED"
        assert issue(admin, admin).status_code == 403
        assert issue(admin, user, reason="").status_code == 400

    def test_a_new_link_invalidates_the_previous_one_and_links_expire(self):
        admin, user = make_user("admin"), make_user()
        first = issue(admin, user).json()["token"]
        second = issue(admin, user).json()["token"]
        assert confirm(first).status_code == 400
        past = time_source.db_now() - timedelta(hours=2)
        PasswordResetToken.objects.filter(user_id=user.pk).update(
            created_at=past, expires_at=past + timedelta(minutes=1)
        )
        assert confirm(second).status_code == 400

    def test_reset_does_not_skip_the_second_factor(self):
        admin, user = make_user("admin"), make_user()
        enable_mfa(user)
        assert confirm(issue(admin, user).json()["token"]).status_code == 204
        login_first_step(user, NEW_PASSWORD)  # sigue pidiendo el código


@pytest.mark.django_db
class TestAdminMfaReset:
    def test_admin_removes_a_lost_second_factor(self):
        admin, user = make_user("admin"), make_user()
        enable_mfa(user)
        client = APIClient()
        client.force_authenticate(admin)
        url = f"/api/v1/admin/users/{user.pk}/mfa-reset/"
        assert (
            client.post(url, {"reason": "Perdió el teléfono", "password": PASSWORD}, format="json").status_code == 204
        )
        assert not UserMfa.objects.filter(user_id=user.pk).exists()
        assert "id" in logged_in(user).get("/api/v1/auth/me/").json()
        again = client.post(url, {"reason": "Otra vez", "password": PASSWORD}, format="json")
        assert again.status_code == 409 and again.json()["code"] == "MFA_NOT_ENABLED"

    def test_moderator_cannot(self):
        moderator, user = make_user("moderator"), make_user()
        client = APIClient()
        client.force_authenticate(moderator)
        response = client.post(
            f"/api/v1/admin/users/{user.pk}/mfa-reset/", {"reason": "x" * 5, "password": PASSWORD}, format="json"
        )
        assert response.status_code == 403
