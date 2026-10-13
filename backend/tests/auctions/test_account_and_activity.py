"""Pendientes de Frontend + cuenta y actividad (handoffs de LX-15, LX-35, LX-38; PANTALLAS §3)."""

import uuid

import pytest
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from apps.auctions.models import Auction
from apps.auctions.services import bidding, closing
from apps.notifications.models import Notification

from .helpers import PASSWORD, active_auction, bid, client_for, draft_payload, expire, make_listing, make_user
from .test_reverse_flow import make_org, register, reverse_auction

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _relaxed(monkeypatch):
    monkeypatch.setattr(bidding, "MIN_SECONDS_BETWEEN_BIDS", 0)
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "bids", "1000/min")
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "login", "1000/min")


def code(response):
    return response.json()["code"]


# --- Pendientes de Frontend ------------------------------------------------------------------------


class TestFrontendRequests:
    def test_my_listings_only_mine_with_latest_auction(self):
        ana = make_user()
        auction = active_auction(ana)
        make_listing(ana)
        make_listing(make_user())  # ajena: no debe aparecer
        page = client_for(ana).get("/api/v1/listings/").json()
        assert page["count"] == 2
        by_id = {item["id"]: item for item in page["results"]}
        with_auction = by_id[str(auction.listing_id)]
        assert with_auction["editable"] is False and with_auction["latest_auction"]["id"] == str(auction.pk)
        assert all("owner" not in item for item in page["results"])
        assert client_for(make_user("moderator")).get("/api/v1/listings/").status_code == 403
        assert APIClient().get("/api/v1/listings/").status_code == 401

    def test_auction_detail_exposes_listing_id_for_reports(self):
        auction = active_auction()
        detail = client_for().get(f"/api/v1/auctions/{auction.pk}/").json()
        assert detail["listing_id"] == str(auction.listing_id)
        report = client_for(make_user()).post(
            "/api/v1/reports/",
            {"target_type": "listing", "target_id": detail["listing_id"], "reason": "misleading"},
            format="json",
        )
        assert report.status_code == 201

    def test_notifications_carry_the_public_title(self):
        auction = active_auction()
        ana, beto = make_user(), make_user()
        bid(client_for(ana), auction, "100.00")
        bid(client_for(beto), auction, "105.00")
        expire(auction)
        closing.close_auction(auction.pk)
        for n in Notification.objects.filter(auction_id=auction.pk):
            assert n.data.get("title") == "Laptop", n.type


# --- Perfil y sesiones ------------------------------------------------------------------------------


class TestProfileAndSessions:
    def test_profile_fields_and_public_profile(self):
        user = make_user()
        client = client_for(user)
        updated = client.patch(
            "/api/v1/auth/me/", {"bio": "Coleccionista de relojes", "location_city": "Loja"}, format="json"
        ).json()
        assert (updated["bio"], updated["location_city"]) == ("Coleccionista de relojes", "Loja")
        assert (
            code(client.patch("/api/v1/auth/me/", {"bio": "visita www.estafa.com"}, format="json"))
            == "VALIDATION_ERROR"
        )
        assert code(client.patch("/api/v1/auth/me/", {"email": "x@y.co"}, format="json")) == "UNKNOWN_FIELD"
        public = client_for().get(f"/api/v1/users/{user.pk}/").json()
        assert public["bio"] == "Coleccionista de relojes" and "email" not in public
        cleared = client.patch("/api/v1/auth/me/", {"bio": ""}, format="json").json()
        assert cleared["bio"] is None

    def test_list_and_revoke_other_sessions(self):
        user = make_user()
        first, second = APIClient(), APIClient()
        for c in (first, second):
            assert (
                c.post("/api/v1/auth/login/", {"email": user.email, "password": PASSWORD}, format="json").status_code
                == 200
            )
        sessions = first.get("/api/v1/auth/sessions/").json()["results"]
        assert len(sessions) == 2 and sum(s["is_current"] for s in sessions) == 1
        assert all(len(s["id"]) == 16 for s in sessions)  # nunca la clave real
        assert first.post("/api/v1/auth/sessions/revoke-others/").json()["revoked"] == 1
        assert first.get("/api/v1/auth/me/").status_code == 200
        assert second.get("/api/v1/auth/me/").status_code == 401


# --- Panel, participaciones y actividad ----------------------------------------------------------------


class TestMyActivity:
    def test_participations_tabs_and_own_data_only(self):
        ana, beto = make_user(), make_user()
        leading = active_auction(proxy_enabled=True)
        outbid = active_auction()
        client_for(ana).put(f"/api/v1/auctions/{leading.pk}/proxy-limit/", {"max_amount": "333.33"}, format="json")
        bid(client_for(ana), outbid, "100.00")
        bid(client_for(beto), outbid, "105.00")
        # beto también puja en la del proxy de ana: el máximo de ana nunca debe verse en lo de beto
        bid(client_for(beto), leading, "150.00")

        active = {
            i["auction_id"]: i for i in client_for(ana).get("/api/v1/me/participations/?tab=active").json()["results"]
        }
        assert active[str(leading.pk)]["my_status"] == "leading"
        assert active[str(leading.pk)]["my_proxy_max"] == "333.33"
        assert active[str(outbid.pk)]["my_status"] == "outbid"
        assert "333.33" not in client_for(beto).get("/api/v1/me/participations/").content.decode()

        expire(outbid)
        closing.close_auction(outbid.pk)
        lost = client_for(ana).get("/api/v1/me/participations/?tab=lost").json()["results"]
        assert [i["auction_id"] for i in lost] == [str(outbid.pk)]
        won = client_for(beto).get("/api/v1/me/participations/?tab=won").json()["results"]
        assert won[0]["my_status"] == "won" and won[0]["current_price"] == "105.00"

    def test_sealed_participation_never_shows_others(self):
        sealed = active_auction(mechanism="sealed", min_increment=None, starting_price="50.00")
        ana, beto = make_user(), make_user()
        for user, amount in ((ana, "61.11"), (beto, "72.22")):
            client_for(user).put(
                f"/api/v1/auctions/{sealed.pk}/sealed-offer/",
                {"amount": amount},
                format="json",
                HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            )
        mine = client_for(ana).get("/api/v1/me/participations/").json()["results"][0]
        assert mine["my_sealed_offer"] == "61.11" and mine["current_price"] is None
        assert "72.22" not in client_for(ana).get("/api/v1/me/participations/").content.decode()

    def test_summary_and_operations_overview(self):
        seller, buyer = make_user(), make_user()
        auction = active_auction(seller)
        bid(client_for(buyer), auction, "120.00")
        expire(auction)
        closing.close_auction(auction.pk)
        s = client_for(seller).get("/api/v1/me/summary/").json()
        assert s["my_auctions"]["sold"] == 1 and s["operations"]["sold_total"] == "120.00"
        assert s["operations"]["pending_settlements"] == 1
        assert "no procesa pagos" in s["operations"]["notice"]
        b = client_for(buyer).get("/api/v1/me/summary/").json()
        assert b["participations"]["won"] == 1 and b["operations"]["bought_total"] == "120.00"

    def test_activity_log_is_mine_and_whitelisted(self):
        ana = make_user()
        auction = active_auction(ana)
        bid(client_for(make_user()), auction, "100.00")
        rows = client_for(ana).get("/api/v1/me/activity/").json()["results"]
        actions = [r["action"] for r in rows]
        assert "auction_published" in actions and "bid_accepted" not in actions  # la puja fue de otro
        published = next(r for r in rows if r["action"] == "auction_published")
        assert published["auction_title"] == "Laptop" and set(published["details"]) <= {"starts_at", "ends_at"}


# --- Catálogo por vendedor y por organización; inscripciones -----------------------------------------------


class TestCatalogFilters:
    def test_seller_filter_hides_drafts(self):
        seller = make_user()
        public = active_auction(seller)
        client_for(seller).post("/api/v1/auctions/", draft_payload(make_listing(seller)), format="json")
        ids = [a["id"] for a in client_for().get(f"/api/v1/auctions/?seller={seller.pk}").json()["results"]]
        assert ids == [str(public.pk)]
        assert code(client_for().get("/api/v1/auctions/?seller=no-es-uuid")) == "VALIDATION_ERROR"

    def test_owner_sees_watchers_count(self):
        auction = active_auction()
        client_for(make_user()).put(f"/api/v1/auctions/{auction.pk}/watch/")
        assert client_for(auction.owner_user).get(f"/api/v1/auctions/{auction.pk}/").json()["watchers_count"] == 1
        assert "watchers_count" not in client_for().get(f"/api/v1/auctions/{auction.pk}/").json()

    def test_organization_panel_and_registrations(self):
        buyer, supplier = make_user(), make_user()
        buyer_org = make_org(buyer, buyer=True)
        supplier_org = make_org(supplier, supplier=True)
        auction = reverse_auction(buyer, buyer_org)
        register(supplier, auction, supplier_org)

        panel = client_for(buyer).get(f"/api/v1/auctions/?organization={buyer_org.pk}").json()
        assert [a["id"] for a in panel["results"]] == [str(auction.pk)]
        assert client_for(supplier).get(f"/api/v1/auctions/?organization={buyer_org.pk}").status_code == 404

        mine = client_for(supplier).get(f"/api/v1/organizations/{supplier_org.pk}/registrations/").json()["results"]
        assert mine[0]["status"] == "registered" and mine[0]["auction"]["id"] == str(auction.pk)
        assert client_for(buyer).get(f"/api/v1/organizations/{supplier_org.pk}/registrations/").status_code == 404
        assert Auction.objects.filter(pk=auction.pk).exists()
