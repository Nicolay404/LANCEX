"""Permisos por capacidad y formato de error a través de la pila HTTP completa.

Las capacidades se calculan con un cargador de principal de prueba (sin base de datos).
"""

import uuid
from dataclasses import dataclass

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.core.capabilities import MembershipSnapshot, Principal

ORG = "11111111-1111-1111-1111-111111111111"
OTHER_ORG = "22222222-2222-2222-2222-222222222222"


@dataclass
class FakeUser:
    pk: str
    platform_role: str = "user"
    status: str = "active"
    is_active: bool = True
    is_authenticated: bool = True
    memberships: tuple = ()


LOADED: list[str] = []


def fake_loader(user: FakeUser) -> Principal:
    LOADED.append(user.pk)
    return Principal(
        user_id=user.pk,
        platform_role=user.platform_role,
        status=user.status,
        is_active=user.is_active,
        memberships=user.memberships,
    )


pytestmark = pytest.mark.urls("tests.core.urls_test_views")


@pytest.fixture(autouse=True)
def _loader():
    LOADED.clear()
    with override_settings(LANCEX_PRINCIPAL_LOADER="tests.core.test_api_permissions_and_errors.fake_loader"):
        yield


def client_for(user: FakeUser | None = None) -> APIClient:
    client = APIClient()
    if user is not None:
        client.force_authenticate(user)
    return client


def assert_error(response, status: int, code: str):
    assert response.status_code == status, response.content
    body = response.json()
    assert set(body) == {"code", "message", "details", "request_id"}
    assert body["code"] == code
    assert body["request_id"] == response["X-Request-ID"]
    return body


class TestCapabilityPermissions:
    def test_public_endpoint_needs_no_session(self):
        response = client_for().get("/api/v1/public/")
        assert response.status_code == 200
        assert len(response["X-Request-ID"]) == 32

    def test_anonymous_on_protected_endpoint_gets_401(self):
        assert_error(client_for().post("/api/v1/bids/"), 401, "AUTH_REQUIRED")

    def test_user_with_capability_is_allowed(self):
        assert client_for(FakeUser(pk="u1")).post("/api/v1/bids/").status_code == 201

    @pytest.mark.parametrize("role", ["moderator", "admin"])
    def test_staff_cannot_bid(self, role):
        assert_error(client_for(FakeUser(pk="s1", platform_role=role)).post("/api/v1/bids/"), 403, "FORBIDDEN")

    def test_user_cannot_reach_admin_endpoint(self):
        assert_error(client_for(FakeUser(pk="u1")).get("/api/v1/admin/audit/"), 403, "FORBIDDEN")

    def test_admin_reaches_admin_endpoint(self):
        assert client_for(FakeUser(pk="a1", platform_role="admin")).get("/api/v1/admin/audit/").status_code == 200

    def test_suspended_user_is_treated_as_visitor(self):
        response = client_for(FakeUser(pk="u1", status="suspended")).post("/api/v1/bids/")
        assert_error(response, 403, "FORBIDDEN")

    def test_undeclared_view_denies_everyone(self):
        assert_error(client_for(FakeUser(pk="a1", platform_role="admin")).get("/api/v1/undeclared/"), 403, "FORBIDDEN")

    def test_capabilities_are_loaded_once_per_request(self):
        client_for(FakeUser(pk="u1")).post("/api/v1/bids/")
        assert LOADED == ["u1"]


class TestOrganizationScopedPermissions:
    def buyer(self, org=ORG):
        membership = MembershipSnapshot(org, "member", "active", "verified", True, False)
        return FakeUser(pk="u1", memberships=(membership,))

    def test_member_of_the_url_organization_is_allowed(self):
        assert client_for(self.buyer()).post(f"/api/v1/organizations/{ORG}/reverse/").status_code == 201

    def test_member_of_another_organization_is_denied(self):
        response = client_for(self.buyer(org=OTHER_ORG)).post(f"/api/v1/organizations/{ORG}/reverse/")
        assert_error(response, 403, "FORBIDDEN")

    def test_staff_never_acts_for_an_organization(self):
        membership = MembershipSnapshot(ORG, "owner", "active", "verified", True, True)
        admin = FakeUser(pk="a1", platform_role="admin", memberships=(membership,))
        assert_error(client_for(admin).post(f"/api/v1/organizations/{ORG}/reverse/"), 403, "FORBIDDEN")


class TestByMethod:
    def test_get_is_public(self):
        assert client_for().get("/api/v1/listings/").status_code == 200

    def test_post_requires_capability(self):
        assert_error(client_for().post("/api/v1/listings/"), 401, "AUTH_REQUIRED")
        assert client_for(FakeUser(pk="u1")).post("/api/v1/listings/").status_code == 201

    def test_undeclared_method_is_denied(self):
        assert_error(client_for(FakeUser(pk="u1")).delete("/api/v1/listings/"), 403, "FORBIDDEN")


class TestErrorFormat:
    def test_unknown_field_returns_400_unknown_field(self):
        response = client_for().post(
            "/api/v1/strict/", {"display_name": "Ana", "platform_role": "admin"}, format="json"
        )
        body = assert_error(response, 400, "UNKNOWN_FIELD")
        assert body["details"] == {"fields": ["platform_role"]}

    def test_validation_error_lists_fields(self):
        body = assert_error(client_for().post("/api/v1/strict/", {}, format="json"), 400, "VALIDATION_ERROR")
        assert "display_name" in body["details"]["fields"]

    def test_malformed_json_is_a_validation_error(self):
        response = client_for().post("/api/v1/strict/", "{not json", content_type="application/json")
        assert_error(response, 400, "VALIDATION_ERROR")

    def test_domain_error_keeps_its_code_and_details(self):
        body = assert_error(client_for().get("/api/v1/conflict/"), 409, "AUCTION_NOT_ACTIVE")
        assert body["details"] == {"status": "closed"}

    def test_unhandled_exception_hides_internals(self):
        body = assert_error(client_for().get("/api/v1/crash/"), 500, "INTERNAL_ERROR")
        assert "SELECT" not in str(body) and "Traceback" not in str(body)

    def test_unknown_route_returns_json_404(self):
        response = client_for().get(f"/api/v1/does-not-exist/{uuid.uuid4()}/")
        assert response.status_code == 404
        assert response.json()["code"] == "NOT_FOUND"

    def test_security_headers_present(self):
        response = client_for().get("/api/v1/public/")
        assert response["X-Frame-Options"] == "DENY"
        assert response["X-Content-Type-Options"] == "nosniff"
        assert response["Referrer-Policy"] == "same-origin"
