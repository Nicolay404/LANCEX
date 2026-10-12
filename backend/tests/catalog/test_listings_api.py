"""LX-12 / LX-16 (base): categorías y publicaciones con permisos de dueño."""

import uuid
from dataclasses import dataclass

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.catalog import services
from apps.core.capabilities import Principal

LISTING = {
    "category_id": 1,
    "title": "Laptop usada",
    "description": "Funciona bien.",
    "item_condition": "used",
    "location_city": "Loja",
}


@dataclass
class FakeUser:
    pk: str
    platform_role: str = "user"
    status: str = "active"
    is_active: bool = True
    is_authenticated: bool = True


def fake_loader(user):
    return Principal(user_id=user.pk, platform_role=user.platform_role, status=user.status, is_active=True)


def as_user(user=None) -> APIClient:
    client = APIClient()
    if user is not None:
        client.force_authenticate(user)
    return client


@pytest.fixture
def fake_principals():
    with override_settings(LANCEX_PRINCIPAL_LOADER="tests.catalog.test_listings_api.fake_loader"):
        yield


# --- Sin base de datos -------------------------------------------------------------------


@pytest.mark.usefixtures("fake_principals")
class TestListingPermissions:
    def test_visitor_cannot_create(self):
        assert as_user().post("/api/v1/listings/", LISTING, format="json").status_code == 401

    @pytest.mark.parametrize("role", ["moderator", "admin"])
    def test_staff_cannot_sell(self, role):
        response = as_user(FakeUser("s", platform_role=role)).post("/api/v1/listings/", LISTING, format="json")
        assert response.status_code == 403

    @pytest.mark.parametrize("field", ["owner_user_id", "id", "created_at", "editable"])
    def test_server_fields_are_rejected(self, field):
        payload = {**LISTING, field: "x"}
        response = as_user(FakeUser("u")).post("/api/v1/listings/", payload, format="json")
        assert response.status_code == 400
        assert response.json()["code"] == "UNKNOWN_FIELD"

    def test_patch_is_strict_too(self):
        response = as_user(FakeUser("u")).patch(
            f"/api/v1/listings/{uuid.uuid4()}/", {"owner_user_id": str(uuid.uuid4())}, format="json"
        )
        assert response.json()["code"] == "UNKNOWN_FIELD"

    def test_invalid_condition_is_validation_error(self):
        response = as_user(FakeUser("u")).post("/api/v1/listings/", {**LISTING, "item_condition": "x"}, format="json")
        assert response.json()["code"] == "VALIDATION_ERROR"


# --- Con base de datos -------------------------------------------------------------------


@pytest.fixture
def category(db):
    from apps.catalog.models import Category

    slug = f"test-{uuid.uuid4().hex[:8]}"
    return Category.objects.create(name=slug, slug=slug, is_active=True)


def make_user(**extra):
    from apps.accounts.models import User

    return User.objects.create_user(
        email=f"t-{uuid.uuid4().hex[:10]}@example.com", password="Prueba-Larga-123", display_name="Tester", **extra
    )


@pytest.fixture
def no_open_auctions(monkeypatch):
    monkeypatch.setattr(services, "listing_has_open_auction", lambda _id: False)


@pytest.mark.django_db
@pytest.mark.usefixtures("no_open_auctions")
class TestListingFlow:
    def create(self, client, category, **overrides):
        return client.post("/api/v1/listings/", {**LISTING, "category_id": category.pk, **overrides}, format="json")

    def test_categories_are_public_and_only_active(self, category):
        from apps.catalog.models import Category

        hidden = Category.objects.create(name="oculta", slug=f"h-{uuid.uuid4().hex[:8]}", is_active=False)
        ids = {c["id"] for c in APIClient().get("/api/v1/categories/").json()}
        assert category.pk in ids and hidden.pk not in ids

    def test_owner_creates_reads_and_edits(self, category):
        owner = as_user(make_user())
        created = self.create(owner, category)
        assert created.status_code == 201
        body = created.json()
        assert body["editable"] is True and body["category"]["id"] == category.pk

        url = f"/api/v1/listings/{body['id']}/"
        assert owner.get(url).status_code == 200
        edited = owner.patch(url, {"title": "Laptop casi nueva"}, format="json")
        assert edited.json()["title"] == "Laptop casi nueva"
        assert edited.json()["updated_at"] >= body["updated_at"]

    def test_other_users_get_404_not_403(self, category):
        listing_id = self.create(as_user(make_user()), category).json()["id"]
        intruder = as_user(make_user())
        assert intruder.get(f"/api/v1/listings/{listing_id}/").status_code == 404
        assert intruder.patch(f"/api/v1/listings/{listing_id}/", {"title": "mío"}, format="json").status_code == 404

    def test_inactive_category_is_rejected(self, category):
        category.is_active = False
        category.save(update_fields=["is_active"])
        response = self.create(as_user(make_user()), category)
        assert response.json()["code"] == "VALIDATION_ERROR"

    def test_listing_limit(self, category, monkeypatch):
        monkeypatch.setattr(services, "MAX_LISTINGS_PER_USER", 2)
        client = as_user(make_user())
        assert [self.create(client, category).status_code for _ in range(2)] == [201, 201]
        response = self.create(client, category)
        assert response.status_code == 409 and response.json()["code"] == "LIMIT_REACHED"

    def test_listing_with_open_auction_is_locked(self, category, monkeypatch):
        client = as_user(make_user())
        listing_id = self.create(client, category).json()["id"]
        monkeypatch.setattr(services, "listing_has_open_auction", lambda _id: True)
        response = client.patch(f"/api/v1/listings/{listing_id}/", {"title": "otro"}, format="json")
        assert response.status_code == 409 and response.json()["code"] == "LISTING_LOCKED"
