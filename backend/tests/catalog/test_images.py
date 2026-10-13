"""LX-70: imágenes con URLs firmadas (T17). Storage se sustituye por un doble en memoria."""

import uuid

import pytest
from django.test import override_settings

from apps.auctions.models import Auction
from apps.catalog.models import ListingImage
from apps.catalog.services.storage import ObjectInfo
from tests.auctions.helpers import active_auction, client_for, make_listing, make_user

pytestmark = pytest.mark.django_db


class FakeStorage:
    objects: dict[str, ObjectInfo] = {}
    deleted: list[str] = []

    def signed_upload_url(self, path):
        return f"https://storage.test/upload/{path}?token=t"

    def object_info(self, path):
        return self.objects.get(path)

    def signed_read_urls(self, paths, ttl_s=3600):
        return {p: f"https://storage.test/read/{p}?token=r" for p in paths}

    def delete(self, path):
        self.deleted.append(path)
        self.objects.pop(path, None)


@pytest.fixture(autouse=True)
def fake_storage():
    FakeStorage.objects = {}
    FakeStorage.deleted = []
    with override_settings(LANCEX_STORAGE_FACTORY="tests.catalog.test_images.FakeStorage"):
        yield FakeStorage


def upload(client, listing, content_type="image/jpeg", size=1000, real=None, position=0):
    ticket = client.post(
        f"/api/v1/listings/{listing.pk}/images/upload-url/",
        {"content_type": content_type, "size_bytes": size},
        format="json",
    )
    if ticket.status_code != 200:
        return ticket
    path = ticket.json()["storage_path"]
    FakeStorage.objects[path] = real or ObjectInfo(content_type, size)  # el navegador "sube" el archivo
    return client.post(
        f"/api/v1/listings/{listing.pk}/images/", {"storage_path": path, "position": position}, format="json"
    )


def code(response):
    return response.json()["code"]


def test_owner_uploads_and_auction_detail_serves_signed_urls():
    owner = make_user()
    auction = active_auction(owner)
    listing = auction.listing
    Auction.objects.filter(pk=auction.pk).update(status="cancelled")  # desbloquea la publicación
    response = upload(client_for(owner), listing)
    assert response.status_code == 201
    path = ListingImage.objects.get(listing=listing).storage_path
    assert path.startswith(f"listings/{listing.pk}/") and path.endswith(".jpg")
    detail = client_for().get(f"/api/v1/auctions/{auction.pk}/").json()
    assert detail["images"][0]["url"].startswith("https://storage.test/read/")


@pytest.mark.parametrize(
    ("content_type", "size"), [("image/svg+xml", 100), ("application/pdf", 100), ("image/png", 5 * 1024 * 1024 + 1)]
)
def test_declared_type_and_size_are_validated(content_type, size):
    owner = make_user()
    response = upload(client_for(owner), make_listing(owner), content_type, size)
    assert code(response) == "VALIDATION_ERROR"


def test_real_metadata_is_checked_after_upload_and_bad_file_is_deleted():
    owner = make_user()
    listing = make_listing(owner)
    response = upload(client_for(owner), listing, real=ObjectInfo("image/svg+xml", 500))  # declaró JPEG, subió SVG
    assert code(response) == "VALIDATION_ERROR"
    assert ListingImage.objects.filter(listing=listing).count() == 0
    assert FakeStorage.deleted


def test_path_must_belong_to_the_listing_and_exist():
    owner = make_user()
    listing = make_listing(owner)
    client = client_for(owner)
    foreign = client.post(
        f"/api/v1/listings/{listing.pk}/images/",
        {"storage_path": f"listings/{uuid.uuid4()}/x.jpg", "position": 0},
        format="json",
    )
    assert code(foreign) == "VALIDATION_ERROR"
    missing = client.post(
        f"/api/v1/listings/{listing.pk}/images/",
        {"storage_path": f"listings/{listing.pk}/nada.jpg", "position": 0},
        format="json",
    )
    assert code(missing) == "VALIDATION_ERROR"


def test_max_six_images_and_others_get_404():
    owner = make_user()
    listing = make_listing(owner)
    client = client_for(owner)
    for i in range(6):
        assert upload(client, listing, position=i).status_code == 201
    assert code(upload(client, listing)) == "LIMIT_REACHED"
    intruder = client_for(make_user())
    assert (
        intruder.post(
            f"/api/v1/listings/{listing.pk}/images/upload-url/",
            {"content_type": "image/png", "size_bytes": 10},
            format="json",
        ).status_code
        == 404
    )


def test_locked_while_auction_is_open_and_delete_when_unlocked():
    owner = make_user()
    auction = active_auction(owner)
    assert code(upload(client_for(owner), auction.listing)) == "LISTING_LOCKED"
    Auction.objects.filter(pk=auction.pk).update(status="cancelled")
    upload(client_for(owner), auction.listing)
    image = ListingImage.objects.get(listing=auction.listing)
    response = client_for(owner).delete(f"/api/v1/listings/{auction.listing_id}/images/{image.pk}/")
    assert response.status_code == 204
    assert image.storage_path in FakeStorage.deleted
