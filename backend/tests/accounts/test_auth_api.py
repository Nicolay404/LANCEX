"""LX-11: registro, login, logout, me y cambio de contraseña.

- Pruebas sin base: CSRF, entrada estricta, bloqueo de login, mensajes genéricos, suspendidos.
- Pruebas `django_db`: flujo completo contra el PostgreSQL local preparado con SQL (se omiten
  si no está disponible; en CI con LANCEX_REQUIRE_DB=1 son obligatorias).
"""

import uuid
from types import SimpleNamespace

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts import services
from apps.accounts.services import lockout
from apps.accounts.services.validation import clean_display_name
from apps.core.errors import ValidationFailed

STRONG = "Correcto-Caballo-Bateria-9"


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


def csrf_client() -> APIClient:
    return APIClient(enforce_csrf_checks=True)


def code(response) -> str:
    return response.json()["code"]


# --- Sin base de datos -------------------------------------------------------------------


class TestDisplayName:
    @pytest.mark.parametrize("name", ["Ana", "  María   José  ", "Juan.Perez", "x" * 60])
    def test_valid(self, name):
        assert clean_display_name(name) == " ".join(name.split())

    @pytest.mark.parametrize("name", ["Al", "x" * 61, "visita www.estafa.com", "http://x", "compra en tienda.ec"])
    def test_invalid(self, name):
        with pytest.raises(ValidationFailed) as exc:
            clean_display_name(name)
        assert "display_name" in exc.value.details["fields"]


class TestCsrf:
    def test_csrf_endpoint_sets_cookie(self):
        response = csrf_client().get("/api/v1/auth/csrf/")
        assert response.status_code == 204
        assert "csrftoken" in response.cookies

    @pytest.mark.parametrize("path", ["/api/v1/auth/login/", "/api/v1/auth/register/"])
    def test_anonymous_mutations_require_csrf_token(self, path):
        response = csrf_client().post(path, {"email": "a@b.co", "password": "x"}, format="json")
        assert response.status_code == 403
        assert code(response) == "CSRF_FAILED"


class TestStrictInput:
    def test_register_rejects_privilege_fields(self):
        payload = {"email": "a@b.co", "password": STRONG, "display_name": "Ana", "platform_role": "admin"}
        response = APIClient().post("/api/v1/auth/register/", payload, format="json")
        assert response.status_code == 400
        assert code(response) == "UNKNOWN_FIELD"
        assert response.json()["details"]["fields"] == ["platform_role"]

    def test_login_requires_fields(self):
        response = APIClient().post("/api/v1/auth/login/", {}, format="json")
        assert code(response) == "VALIDATION_ERROR"


class TestLoginWithoutDatabase:
    @pytest.fixture
    def no_user(self, monkeypatch):
        monkeypatch.setattr(services, "authenticate", lambda *a, **k: None)

    @pytest.fixture
    def relaxed_throttle(self, monkeypatch):
        # DRF copia las tasas en la clase al importar: se parchea ahí, no en settings.
        monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "login", "100/min")

    def login(self, email="ana@example.com", password="mala"):
        return APIClient().post("/api/v1/auth/login/", {"email": email, "password": password}, format="json")

    def test_wrong_credentials_get_generic_401(self, no_user):
        response = self.login()
        assert response.status_code == 401
        assert code(response) == "INVALID_CREDENTIALS"
        assert "ana@example.com" not in response.content.decode()

    def test_five_failures_lock_the_account_for_15_minutes(self, no_user, relaxed_throttle):
        for _ in range(lockout.MAX_FAILURES):
            assert self.login(email="Ana@Example.com ").status_code == 401  # normaliza el email
        response = self.login(email="ana@example.com", password="aunque-fuera-correcta")
        assert response.status_code == 429
        assert code(response) == "RATE_LIMITED"
        assert response.json()["details"]["retry_after_s"] == 15 * 60

    def test_lock_does_not_reveal_whether_the_email_exists(self, no_user, relaxed_throttle):
        for _ in range(lockout.MAX_FAILURES):
            self.login(email="no-existe@example.com")
        assert self.login(email="no-existe@example.com").status_code == 429

    def test_suspended_account_with_correct_password_is_rejected(self, monkeypatch):
        suspended = SimpleNamespace(pk=uuid.uuid4(), status="suspended")
        monkeypatch.setattr(services, "authenticate", lambda *a, **k: suspended)
        response = self.login(password="correcta")
        assert response.status_code == 403
        assert code(response) == "ACCOUNT_SUSPENDED"

    def test_login_is_throttled_per_ip(self, no_user):
        statuses = [self.login(email=f"u{i}@example.com").status_code for i in range(6)]
        assert statuses[:5] == [401] * 5
        assert statuses[5] == 429


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/auth/me/"),
        ("patch", "/api/v1/auth/me/"),
        ("post", "/api/v1/auth/logout/"),
        ("post", "/api/v1/auth/password/"),
    ],
)
def test_account_endpoints_require_session(method, path):
    response = getattr(APIClient(), method)(path, {}, format="json")
    assert response.status_code == 401
    assert code(response) == "AUTH_REQUIRED"


# --- Con base de datos (PostgreSQL local con los SQL de supabase/migrations) -------------


def unique_email() -> str:
    return f"test-{uuid.uuid4().hex[:12]}@example.com"


def register(client, email=None, password=STRONG, name="Usuaria Prueba"):
    return client.post(
        "/api/v1/auth/register/",
        {"email": email or unique_email(), "password": password, "display_name": name},
        format="json",
    )


@pytest.mark.django_db
class TestAuthFlow:
    def test_register_starts_session_and_returns_user_me(self):
        client = APIClient()
        response = register(client)
        assert response.status_code == 201
        body = response.json()
        assert body["platform_role"] == "user"
        assert "bid.place" in body["capabilities"]
        assert body["organizations"] == []
        assert "password" not in body
        assert client.get("/api/v1/auth/me/").status_code == 200

    def test_register_is_audited_with_request_id(self):
        from apps.audit.models import AuditEvent

        response = register(APIClient())
        event = AuditEvent.objects.get(action="user_registered", entity_id=response.json()["id"])
        assert event.request_id == response["X-Request-ID"]

    def test_duplicate_email_is_case_insensitive(self):
        email = unique_email()
        assert register(APIClient(), email=email).status_code == 201
        response = register(APIClient(), email=email.upper())
        assert response.status_code == 409
        assert code(response) == "EMAIL_ALREADY_REGISTERED"

    def test_weak_password_is_rejected(self):
        response = register(APIClient(), password="123")
        assert code(response) == "VALIDATION_ERROR"
        assert "password" in response.json()["details"]["fields"]

    def test_login_logout_cycle(self):
        email = unique_email()
        register(APIClient(), email=email)
        client = APIClient()
        assert (
            client.post("/api/v1/auth/login/", {"email": email, "password": STRONG}, format="json").status_code == 200
        )
        assert client.post("/api/v1/auth/logout/").status_code == 204
        assert client.get("/api/v1/auth/me/").status_code == 401

    def test_patch_me_only_changes_display_name(self):
        client = APIClient()
        register(client)
        response = client.patch("/api/v1/auth/me/", {"display_name": "Nuevo Nombre"}, format="json")
        assert response.json()["display_name"] == "Nuevo Nombre"
        response = client.patch("/api/v1/auth/me/", {"platform_role": "admin"}, format="json")
        assert code(response) == "UNKNOWN_FIELD"

    def test_password_change_requires_current_and_revokes_other_sessions(self):
        email = unique_email()
        first, second = APIClient(), APIClient()
        register(first, email=email)
        second.post("/api/v1/auth/login/", {"email": email, "password": STRONG}, format="json")

        wrong = first.post("/api/v1/auth/password/", {"current_password": "x", "new_password": STRONG + "!"})
        assert code(wrong) == "STEP_UP_FAILED"

        new = STRONG + "-nuevo"
        ok = first.post("/api/v1/auth/password/", {"current_password": STRONG, "new_password": new}, format="json")
        assert ok.status_code == 204
        assert first.get("/api/v1/auth/me/").status_code == 200  # la sesión actual sigue
        assert second.get("/api/v1/auth/me/").status_code == 401  # las demás se revocan
