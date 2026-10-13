"""Huecos detectados al cruzar PANTALLAS-Y-NAVEGACION.md (roles) con la API, contra PostgreSQL."""

import uuid

import pytest
from rest_framework.throttling import ScopedRateThrottle

from apps.auctions.services import bidding, closing
from apps.notifications.models import Notification

from .helpers import active_auction, bid, client_for, expire, make_user
from .test_reverse_flow import decide, make_need, make_org, register, reverse_auction, start

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _relaxed(monkeypatch):
    monkeypatch.setattr(bidding, "MIN_SECONDS_BETWEEN_BIDS", 0)
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "bids", "1000/min")
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "reports", "1000/day")


# --- Visitante ---------------------------------------------------------------------------------------


def test_public_result_shows_a_pseudonymous_winner():
    auction = active_auction()
    winner = make_user()
    bid(client_for(make_user()), auction, "100.00")
    bid(client_for(winner), auction, "105.00")
    expire(auction)
    closing.close_auction(auction.pk)
    public = client_for().get(f"/api/v1/auctions/{auction.pk}/result/").json()
    assert public["winner_pseudonym"] == "Postor 2"
    assert winner.display_name not in str(public)
    assert client_for(winner).get(f"/api/v1/auctions/{auction.pk}/result/").json()["winner_pseudonym"] == "Tú"


def test_public_need_shows_its_auction_and_admitted_count():
    buyer, supplier = make_user(), make_user()
    buyer_org, supplier_org = make_org(buyer, buyer=True), make_org(supplier, supplier=True)
    auction = reverse_auction(buyer, buyer_org)
    pid = register(supplier, auction, supplier_org).json()["id"]
    decide(buyer, auction, pid, "admitted")
    need = client_for().get(f"/api/v1/procurement-requests/{auction.procurement_request_id}/").json()
    assert need["auction"]["id"] == str(auction.pk) and need["auction"]["admitted_count"] == 1


# --- Usuario: calificar ---------------------------------------------------------------------------------


def test_result_tells_if_the_viewer_can_rate():
    auction = active_auction()
    winner = make_user()
    bid(client_for(winner), auction, "100.00")
    expire(auction)
    closing.close_auction(auction.pk)
    owner = client_for(auction.owner_user)
    assert owner.get(f"/api/v1/auctions/{auction.pk}/result/").json()["viewer"]["can_rate"] is False  # sin liquidar
    owner.patch(f"/api/v1/auctions/{auction.pk}/settlement/", {"settlement_status": "completed"}, format="json")
    assert owner.get(f"/api/v1/auctions/{auction.pk}/result/").json()["viewer"]["can_rate"] is True
    owner.post(f"/api/v1/auctions/{auction.pk}/rating/", {"score": 4}, format="json")
    viewer = owner.get(f"/api/v1/auctions/{auction.pk}/result/").json()["viewer"]
    assert viewer["can_rate"] is False and viewer["my_rating"]["score"] == 4


# --- Organización compradora --------------------------------------------------------------------------------


class TestBuyerOrganization:
    def test_needs_list_panel_pending_and_contact_for_members(self):
        buyer, colleague, supplier = make_user(), make_user(), make_user()
        buyer_org, supplier_org = make_org(buyer, buyer=True), make_org(supplier, supplier=True)
        client_for(buyer).post(
            f"/api/v1/organizations/{buyer_org.pk}/members/", {"email": colleague.email}, format="json"
        )
        auction = reverse_auction(buyer, buyer_org)
        make_need(buyer, buyer_org)  # segunda necesidad, sin subasta

        needs = client_for(colleague).get(f"/api/v1/organizations/{buyer_org.pk}/procurement-requests/").json()
        assert needs["count"] == 2 and sum(1 for n in needs["results"] if n["auction"]) == 1
        assert (
            client_for(supplier).get(f"/api/v1/organizations/{buyer_org.pk}/procurement-requests/").status_code == 404
        )

        pid = register(supplier, auction, supplier_org).json()["id"]
        panel = client_for(colleague).get(f"/api/v1/auctions/?organization={buyer_org.pk}").json()["results"]
        assert panel[0]["registrations_pending"] == 1

        decide(buyer, auction, pid, "admitted")
        start(auction)
        client_for(supplier).post(
            f"/api/v1/auctions/{auction.pk}/bids/",
            {"unit_price": "100.0000", "shipping_cost": "0.00"},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )
        expire(auction)
        closing.close_auction(auction.pk)
        # Un miembro de la compradora que NO creó la subasta también ve el contacto del ganador.
        result = client_for(colleague).get(f"/api/v1/auctions/{auction.pk}/result/").json()
        assert result["contact"]["email"] == supplier.email


# --- Organización proveedora ---------------------------------------------------------------------------------


class TestSupplierOrganization:
    def test_opportunities_exclude_conflicts_and_show_my_registration(self):
        supplier = make_user()
        supplier_org = make_org(supplier, supplier=True)
        foreign_buyer = make_user()
        open_auction = reverse_auction(foreign_buyer, make_org(foreign_buyer, buyer=True))
        # El mismo usuario es miembro de una compradora: sus subastas son conflicto y no se ofrecen.
        own_buyer_org = make_org(supplier, buyer=True)
        conflicted = reverse_auction(supplier, own_buyer_org)

        register(supplier, open_auction, supplier_org)
        items = client_for(supplier).get(f"/api/v1/organizations/{supplier_org.pk}/opportunities/").json()["results"]
        ids = {i["auction_id"]: i for i in items}
        assert str(open_auction.pk) in ids and str(conflicted.pk) not in ids
        assert ids[str(open_auction.pk)]["phase"] == "registration"
        assert ids[str(open_auction.pk)]["my_registration"]["status"] == "registered"
        assert (
            client_for(make_user()).get(f"/api/v1/organizations/{supplier_org.pk}/opportunities/").status_code == 403
        )  # sin organizaciones

    def test_reverse_quote_uses_the_official_formula(self):
        buyer, supplier = make_user(), make_user()
        auction = reverse_auction(buyer, make_org(buyer, buyer=True))
        make_org(supplier, supplier=True)
        quote = (
            client_for(supplier)
            .post(
                f"/api/v1/auctions/{auction.pk}/reverse-quote/",
                {"unit_price": "2.0050", "shipping_cost": "0.00"},
                format="json",
            )
            .json()
        )
        # cantidad 100.000 × 2.0050 = 200.50 (ROUND_HALF_UP)
        assert quote == {**quote, "total": "200.50", "maximum_allowed": "12000.00", "within_maximum": True}


# --- Moderación y avisos --------------------------------------------------------------------------------------


class TestModerationGaps:
    def test_organization_review_with_members_and_owner_notification(self):
        owner = make_user()
        org = make_org(owner, buyer=True, verified=False)
        moderator = client_for(make_user("moderator"))
        detail = moderator.get(f"/api/v1/moderation/organizations/{org.pk}/").json()
        assert detail["members"][0]["email"] == owner.email
        moderator.post(
            f"/api/v1/moderation/organizations/{org.pk}/decision/",
            {"status": "rejected", "note": "RUC no coincide"},
            format="json",
        )
        notification = Notification.objects.get(user_id=owner.pk, type="organization_rejected")
        assert notification.data["reason"] == "RUC no coincide"

    def test_reporter_is_told_without_details_and_inbox_counts_reported(self):
        auction = active_auction()
        reporter = make_user()
        client_for(reporter).post(
            "/api/v1/reports/",
            {"target_type": "auction", "target_id": str(auction.pk), "reason": "fraud"},
            format="json",
        )
        moderator = client_for(make_user("moderator"))
        assert moderator.get("/api/v1/moderation/summary/").json()["reported_active_auctions"] >= 1
        from apps.moderation.models import Report

        report = Report.objects.get(target_id=auction.pk)
        moderator.post(
            f"/api/v1/moderation/reports/{report.pk}/resolve/",
            {"status": "dismissed", "note": "Sin pruebas suficientes"},
            format="json",
        )
        notification = Notification.objects.get(user_id=reporter.pk, type="report_resolved")
        assert notification.data == {"target_type": "auction"}  # sin la nota ni la acción
