"""LX-21..LX-24: ciclo de vida, pujas, cierre y lecturas por audiencia contra PostgreSQL."""

import uuid

import pytest
from rest_framework.throttling import ScopedRateThrottle

from apps.auctions.models import Auction, Bid
from apps.auctions.services import bidding, closing
from apps.audit.models import AuditEvent

from .helpers import active_auction, bid, client_for, draft_payload, expire, make_listing, make_user

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _no_bid_pause(monkeypatch):
    # El límite de 1 puja/s se prueba aparte; aquí estorbaría a pujas consecutivas.
    monkeypatch.setattr(bidding, "MIN_SECONDS_BETWEEN_BIDS", 0)
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "bids", "1000/min")


def code(response):
    return response.json()["code"]


# --- Ciclo de vida (LX-21) ----------------------------------------------------------------


class TestLifecycle:
    def test_draft_is_only_visible_to_its_owner(self):
        owner = make_user()
        response = client_for(owner).post("/api/v1/auctions/", draft_payload(make_listing(owner)), format="json")
        assert response.status_code == 201
        body = response.json()
        assert body["status"] == "draft" and body["reserve_price"] is None
        assert client_for(make_user()).get(f"/api/v1/auctions/{body['id']}/").status_code == 404
        assert client_for().get(f"/api/v1/auctions/{body['id']}/").status_code == 404

    def test_cannot_auction_someone_elses_listing(self):
        listing = make_listing(make_user())
        response = client_for(make_user()).post("/api/v1/auctions/", draft_payload(listing), format="json")
        assert code(response) == "VALIDATION_ERROR"

    def test_one_open_auction_per_listing(self):
        owner = make_user()
        listing = make_listing(owner)
        client = client_for(owner)
        assert client.post("/api/v1/auctions/", draft_payload(listing), format="json").status_code == 201
        second = client.post("/api/v1/auctions/", draft_payload(listing), format="json")
        assert code(second) == "LISTING_HAS_OPEN_AUCTION"

    def test_matrix_and_unavailable_modalities(self):
        owner = make_user()
        client = client_for(owner)
        bad = client.post(
            "/api/v1/auctions/",
            draft_payload(make_listing(owner), mechanism="sealed", proxy_enabled=True),
            format="json",
        )
        assert code(bad) == "MECHANISM_COMBINATION_NOT_ALLOWED"

    def test_amount_precision_is_enforced(self):
        owner = make_user()
        response = client_for(owner).post(
            "/api/v1/auctions/", draft_payload(make_listing(owner), starting_price="100.001"), format="json"
        )
        assert code(response) == "INVALID_AMOUNT_PRECISION"

    def test_publish_freezes_rules_and_is_audited(self):
        auction = active_auction()
        owner_client = client_for(auction.owner_user)
        assert auction.status == "scheduled" and auction.rules_snapshot["starting_price"] == "100.00"
        assert "reserve_price" not in auction.rules_snapshot
        locked = owner_client.patch(f"/api/v1/auctions/{auction.pk}/", {"starting_price": "1.00"}, format="json")
        assert code(locked) == "RULES_LOCKED"
        fixed = owner_client.patch(f"/api/v1/auctions/{auction.pk}/", {"title": "Laptop corregida"}, format="json")
        assert fixed.json()["title"] == "Laptop corregida"
        actions = set(AuditEvent.objects.filter(auction_id=auction.pk).values_list("action", flat=True))
        assert {"auction_created", "auction_published", "auction_text_corrected"} <= actions

    def test_owner_cancels_only_without_bids(self):
        auction = active_auction()
        bidder = client_for(make_user())
        assert bid(bidder, auction, "100.00").status_code == 201
        response = client_for(auction.owner_user).post(
            f"/api/v1/auctions/{auction.pk}/cancel/", {"reason": "me arrepentí"}, format="json"
        )
        assert code(response) == "INVALID_STATE_TRANSITION"

        free = active_auction()
        ok = client_for(free.owner_user).post(f"/api/v1/auctions/{free.pk}/cancel/", {"reason": "error"}, format="json")
        assert ok.json()["status"] == "cancelled"

    def test_other_users_cannot_manage(self):
        auction = active_auction()
        intruder = client_for(make_user())
        assert intruder.post(f"/api/v1/auctions/{auction.pk}/publish/").status_code == 403
        assert (
            intruder.post(f"/api/v1/auctions/{auction.pk}/cancel/", {"reason": "xxx"}, format="json").status_code == 403
        )


# --- Pujas (LX-22) -------------------------------------------------------------------------


class TestBidding:
    def test_bid_flow_updates_price_leader_version_and_audit(self):
        auction = active_auction()
        ana, beto = make_user(), make_user()
        first = bid(client_for(ana), auction, "100.00")
        assert first.status_code == 201
        assert first.json()["bid"]["seq"] == 1 and first.json()["auction"]["viewer_is_leader"] is True

        low = bid(client_for(beto), auction, "104.99")
        assert code(low) == "BID_BELOW_MINIMUM" and low.json()["details"]["minimum_allowed"] == "105.00"
        assert bid(client_for(beto), auction, "105.00").status_code == 201

        auction.refresh_from_db()
        assert (auction.current_price, auction.bid_count, str(auction.leader_user_id)) == (
            pytest.approx(105),
            2,
            str(beto.pk),
        )
        assert AuditEvent.objects.filter(auction_id=auction.pk, action="bid_accepted").count() == 2

    def test_idempotent_retry_returns_the_same_bid(self):
        auction = active_auction()
        client = client_for(make_user())
        key = str(uuid.uuid4())
        assert bid(client, auction, "100.00", key).status_code == 201
        retry = bid(client, auction, "100.00", key)
        assert retry.status_code == 200 and retry.json()["bid"]["seq"] == 1
        assert code(bid(client, auction, "150.00", key)) == "IDEMPOTENCY_CONFLICT"
        assert Bid.objects.filter(auction_id=auction.pk).count() == 1

    def test_idempotency_key_is_required(self):
        auction = active_auction()
        response = client_for(make_user()).post(
            f"/api/v1/auctions/{auction.pk}/bids/", {"amount": "100.00"}, format="json"
        )
        assert code(response) == "VALIDATION_ERROR"

    def test_owner_and_leader_rules(self):
        auction = active_auction()
        assert code(bid(client_for(auction.owner_user), auction, "500.00")) == "BID_ON_OWN_AUCTION"
        leader = client_for(make_user())
        bid(leader, auction, "100.00")
        assert code(bid(leader, auction, "200.00")) == "ALREADY_LEADING"

    def test_late_bid_is_rejected_even_if_not_closed_yet(self):
        auction = active_auction()
        expire(auction)
        assert code(bid(client_for(make_user()), auction, "100.00")) == "AUCTION_NOT_ACTIVE"

    def test_one_manual_bid_per_second(self, monkeypatch):
        monkeypatch.setattr(bidding, "MIN_SECONDS_BETWEEN_BIDS", 60)
        auction = active_auction()
        ana, beto = client_for(make_user()), client_for(make_user())
        bid(ana, auction, "100.00")
        bid(beto, auction, "105.00")
        assert code(bid(ana, auction, "110.00")) == "RATE_LIMITED"

    @pytest.mark.parametrize("role", ["moderator", "admin"])
    def test_staff_cannot_bid(self, role):
        auction = active_auction()
        assert bid(client_for(make_user(role)), auction, "100.00").status_code == 403

    def test_server_computed_fields_are_rejected(self):
        auction = active_auction()
        response = client_for(make_user()).post(
            f"/api/v1/auctions/{auction.pk}/bids/",
            {"amount": "100.00", "status": "accepted", "winner_user_id": str(uuid.uuid4())},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )
        assert code(response) == "UNKNOWN_FIELD"


# --- Cierre (LX-23) ------------------------------------------------------------------------


class TestClosing:
    def test_close_awards_highest_bid_once(self):
        auction = active_auction()
        winner = make_user()
        bid(client_for(make_user()), auction, "100.00")
        bid(client_for(winner), auction, "120.00")
        expire(auction)
        assert closing.close_auction(auction.pk).closed is True
        assert closing.close_auction(auction.pk).closed is False  # idempotente
        auction.refresh_from_db()
        assert (auction.status, auction.outcome, str(auction.winner_user_id)) == ("closed", "awarded", str(winner.pk))
        assert AuditEvent.objects.filter(auction_id=auction.pk, action="auction_closed").count() == 1

    def test_reserve_not_met_is_unsold(self):
        auction = active_auction(reserve_price="500.00")
        bid(client_for(make_user()), auction, "100.00")
        expire(auction)
        closing.close_auction(auction.pk)
        auction.refresh_from_db()
        assert auction.outcome == "unsold" and auction.winner_user_id is None

    def test_no_bids_is_unsold(self):
        auction = active_auction()
        expire(auction)
        closing.close_auction(auction.pk)
        auction.refresh_from_db()
        assert auction.outcome == "unsold"

    def test_job_closes_due_auctions_and_writes_heartbeat(self):
        from apps.auctions.models import JobHeartbeat

        auction = active_auction()
        expire(auction)
        assert closing.close_due_auctions() >= 1
        assert Auction.objects.get(pk=auction.pk).status == "closed"
        assert JobHeartbeat.objects.filter(job="close_due_auctions").exists()

    def test_result_endpoint_materializes_pending_close(self):
        auction = active_auction()
        winner = make_user()
        bid(client_for(winner), auction, "100.00")
        expire(auction)
        public = client_for().get(f"/api/v1/auctions/{auction.pk}/").json()
        assert public["status"] == "closed" and public["result_pending"] is True

        result = client_for(winner).get(f"/api/v1/auctions/{auction.pk}/result/").json()
        assert result["outcome"] == "awarded" and result["result_pending"] is False
        assert result["viewer"]["is_winner"] is True
        assert result["contact"]["email"] == auction.owner_user.email  # REGLAS §10

        stranger = client_for(make_user()).get(f"/api/v1/auctions/{auction.pk}/result/").json()
        assert "contact" not in stranger


# --- Lecturas por audiencia (LX-24) ---------------------------------------------------------


class TestReads:
    def test_reserve_price_never_leaks_to_others(self):
        auction = active_auction(reserve_price="777.77")
        bid(client_for(make_user()), auction, "100.00")
        for client in (client_for(), client_for(make_user())):
            for path in ("", "live/", "bids/", "result/"):
                response = client.get(f"/api/v1/auctions/{auction.pk}/{path}")
                assert "777.77" not in response.content.decode(), path
        assert client_for().get("/api/v1/auctions/").content.decode().count("777.77") == 0
        owner_view = client_for(auction.owner_user).get(f"/api/v1/auctions/{auction.pk}/").json()
        assert owner_view["reserve_price"] == "777.77"
        public = client_for().get(f"/api/v1/auctions/{auction.pk}/").json()
        assert public["has_reserve"] is True and public["reserve_met"] is False

    def test_history_uses_pseudonyms_and_marks_you(self):
        auction = active_auction()
        ana, beto = make_user(), make_user()
        bid(client_for(ana), auction, "100.00")
        bid(client_for(beto), auction, "105.00")
        items = client_for(ana).get(f"/api/v1/auctions/{auction.pk}/bids/").json()["results"]
        assert [i["bidder"] for i in items] == ["Postor 2", "Tú"]
        assert all("bidder_identity" not in i for i in items)
        assert ana.display_name not in str(items) and beto.display_name not in str(items)

    def test_owner_sees_identities_only_after_close(self):
        auction = active_auction()
        bid(client_for(make_user()), auction, "100.00")
        owner = client_for(auction.owner_user)
        before = owner.get(f"/api/v1/auctions/{auction.pk}/bids/").json()["results"]
        assert "bidder_identity" not in before[0]
        expire(auction)
        after = owner.get(f"/api/v1/auctions/{auction.pk}/bids/").json()["results"]
        assert "bidder_identity" in after[0]

    def test_live_supports_etag_304(self):
        auction = active_auction()
        client = client_for()
        first = client.get(f"/api/v1/auctions/{auction.pk}/live/")
        assert first.status_code == 200 and first.json()["minimum_next_bid"] == "100.00"
        same = client.get(f"/api/v1/auctions/{auction.pk}/live/", HTTP_IF_NONE_MATCH=first["ETag"])
        assert same.status_code == 304
        bid(client_for(make_user()), auction, "100.00")
        changed = client.get(f"/api/v1/auctions/{auction.pk}/live/", HTTP_IF_NONE_MATCH=first["ETag"])
        assert changed.status_code == 200 and changed.json()["current_price"] == "100.00"

    def test_catalog_filters_by_effective_status_and_hides_drafts(self):
        auction = active_auction()
        owner = auction.owner_user
        client_for(owner).post("/api/v1/auctions/", draft_payload(make_listing(owner)), format="json")
        public_ids = {
            a["id"] for a in client_for().get("/api/v1/auctions/?status=active&page_size=50").json()["results"]
        }
        assert str(auction.pk) in public_ids
        mine = client_for(owner).get("/api/v1/auctions/?mine=owner").json()["results"]
        assert {a["status"] for a in mine} == {"active", "draft"}
        assert client_for().get("/api/v1/auctions/?mine=owner").status_code == 401
