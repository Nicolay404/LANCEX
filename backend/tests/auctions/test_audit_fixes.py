"""Regresiones de la auditoría funcional (documentacion/05-calidad/AUDITORIA-FUNCIONAL-BACKEND.md, D1–D5).

Cada prueba reproduce un defecto confirmado: falla con el código anterior y pasa con la corrección.
"""

import uuid

import pytest
from django.test import override_settings
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from apps.auctions.services import bidding, closing
from apps.audit.models import AuditEvent
from apps.catalog.models import ListingImage, ProcurementRequest

from .helpers import PASSWORD, active_auction, client_for, expire, make_listing, make_user
from .test_reverse_flow import make_org, reverse_auction

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _relaxed(monkeypatch):
    monkeypatch.setattr(bidding, "MIN_SECONDS_BETWEEN_BIDS", 0)
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "bids", "1000/min")
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "login", "1000/min")


def code(response):
    return response.json()["code"]


def test_d1_reverse_auction_texts_are_rejected_instead_of_silently_ignored():
    buyer = make_user()
    auction = reverse_auction(buyer, make_org(buyer, buyer=True))
    title_before = ProcurementRequest.objects.get(pk=auction.procurement_request_id).title
    response = client_for(buyer).patch(f"/api/v1/auctions/{auction.pk}/", {"title": "Otro título"}, format="json")
    assert response.status_code == 400 and code(response) == "VALIDATION_ERROR"
    assert "title" in response.json()["details"]["fields"]
    assert ProcurementRequest.objects.get(pk=auction.procurement_request_id).title == title_before
    assert not AuditEvent.objects.filter(auction_id=auction.pk, action="auction_text_corrected").exists()


def test_d2_moderator_sees_revealed_sealed_offers_only_after_close():
    auction = active_auction(mechanism="sealed", min_increment=None, starting_price="50.00")
    bidder = make_user()
    client_for(bidder).put(
        f"/api/v1/auctions/{auction.pk}/sealed-offer/",
        {"amount": "77.77"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    moderator = client_for(make_user("moderator"))
    before = moderator.get(f"/api/v1/moderation/auctions/{auction.pk}/")
    assert "77.77" not in before.content.decode() and before.json()["sealed_offers"] == []
    expire(auction)
    closing.close_auction(auction.pk)
    after = moderator.get(f"/api/v1/moderation/auctions/{auction.pk}/").json()
    assert after["sealed_offers"][0]["amount"] == "77.77"
    assert after["sealed_offers"][0]["bidder"]["id"] == str(bidder.pk)


def test_d3_mine_participating_includes_sealed_offers():
    auction = active_auction(mechanism="sealed", min_increment=None, starting_price="50.00")
    bidder = make_user()
    client_for(bidder).put(
        f"/api/v1/auctions/{auction.pk}/sealed-offer/",
        {"amount": "60.00"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    ids = [a["id"] for a in client_for(bidder).get("/api/v1/auctions/?mine=participating").json()["results"]]
    assert str(auction.pk) in ids


class _BrokenStorage:
    def __init__(self):
        from apps.catalog.services.storage import StorageUnavailable

        raise StorageUnavailable()


def test_d4_deleting_an_image_without_storage_keeps_the_row():
    owner = make_user()
    listing = make_listing(owner)
    image = ListingImage.objects.create(
        listing=listing,
        storage_path=f"listings/{listing.pk}/a.jpg",
        content_type="image/jpeg",
        size_bytes=10,
        position=0,
    )
    with override_settings(LANCEX_STORAGE_FACTORY="tests.auctions.test_audit_fixes._BrokenStorage"):
        response = client_for(owner).delete(f"/api/v1/listings/{listing.pk}/images/{image.pk}/")
    assert response.status_code == 503 and code(response) == "STORAGE_UNAVAILABLE"
    assert ListingImage.objects.filter(pk=image.pk).exists()  # la fila sigue: estado consistente


def test_d5_profile_changes_and_session_revocation_are_audited_without_values():
    user = make_user()
    client = APIClient()
    client.post("/api/v1/auth/login/", {"email": user.email, "password": PASSWORD}, format="json")
    client.patch("/api/v1/auth/me/", {"bio": "Texto privado de prueba", "display_name": "Nuevo Nombre"}, format="json")
    client.post("/api/v1/auth/sessions/revoke-others/")
    profile = AuditEvent.objects.get(entity_id=user.pk, action="user_profile_updated")
    assert profile.data == {"fields": ["bio", "display_name"]}  # nombres, nunca valores
    assert AuditEvent.objects.filter(entity_id=user.pk, action="security_sessions_revoked").exists()
