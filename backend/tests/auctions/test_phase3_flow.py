"""Fase 3 contra PostgreSQL: proxy (LX-31), soft close (LX-32), notificaciones y seguimiento (LX-33),
reportes (LX-37), e invariante de proxy bajo concurrencia (base de LX-34)."""

import threading
import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import connection
from rest_framework.throttling import ScopedRateThrottle

from apps.auctions.models import Auction, ProxyBidLimit
from apps.auctions.services import bidding, closing
from apps.audit.models import AuditEvent
from apps.core.time import time_source
from apps.notifications.models import Notification, Watchlist

from .helpers import active_auction, bid, client_for, draft_payload, expire, make_listing, make_user


@pytest.fixture(autouse=True)
def _relaxed(monkeypatch):
    monkeypatch.setattr(bidding, "MIN_SECONDS_BETWEEN_BIDS", 0)
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "bids", "1000/min")
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "reports", "1000/day")


def code(response):
    return response.json()["code"]


def set_proxy(client, auction, amount):
    return client.put(f"/api/v1/auctions/{auction.pk}/proxy-limit/", {"max_amount": amount}, format="json")


def types_for(user, auction):
    return sorted(Notification.objects.filter(user_id=user.pk, auction_id=auction.pk).values_list("type", flat=True))


# --- Proxy (LX-31) -------------------------------------------------------------------------


@pytest.mark.django_db
class TestProxyApi:
    def test_proxy_responds_and_max_never_leaks(self):
        auction = active_auction(proxy_enabled=True, reserve_price="900.00")
        ana, beto = make_user(), make_user()
        first = set_proxy(client_for(ana), auction, "321.45")
        assert first.status_code == 200
        assert first.json()["auction"]["current_price"] == "100.00"
        assert first.json()["max_amount"] == "321.45"  # solo a su dueña

        response = bid(client_for(beto), auction, "150.00")
        assert response.status_code == 201
        assert response.json()["outbid_by_proxy"] is True
        assert response.json()["auction"]["current_price"] == "155.00"

        for client in (client_for(), client_for(beto), client_for(auction.owner_user)):
            for path in ("", "live/", "bids/", "result/"):
                body = client.get(f"/api/v1/auctions/{auction.pk}/{path}").content.decode()
                assert "321.45" not in body, path
            assert client.get(f"/api/v1/auctions/{auction.pk}/proxy-limit/").content.decode().count("321.45") == 0
        for event in AuditEvent.objects.filter(auction_id=auction.pk):
            assert "321.45" not in str(event.data)

        mine = client_for(ana).get(f"/api/v1/auctions/{auction.pk}/").json()
        assert mine["viewer"]["my_proxy_max"] == "321.45" and mine["viewer"]["is_leader"] is True

    def test_leader_raises_limit_without_new_bids(self):
        auction = active_auction(proxy_enabled=True)
        ana = client_for(make_user())
        set_proxy(ana, auction, "200.00")
        before = Auction.objects.get(pk=auction.pk).bid_count
        raised = set_proxy(ana, auction, "400.00")
        assert raised.status_code == 200 and raised.json()["bid"] is None
        assert Auction.objects.get(pk=auction.pk).bid_count == before
        assert code(set_proxy(ana, auction, "300.00")) == "PROXY_LIMIT_DECREASE_NOT_ALLOWED"

    def test_outbid_challenger_limit_is_exhausted_and_single_live_limit(self):
        auction = active_auction(proxy_enabled=True)
        ana, beto = make_user(), make_user()
        set_proxy(client_for(ana), auction, "300.00")
        set_proxy(client_for(beto), auction, "250.00")
        live = ProxyBidLimit.objects.filter(auction_id=auction.pk, status="active")
        assert [str(limit.user_id) for limit in live] == [str(ana.pk)]
        assert Auction.objects.get(pk=auction.pk).current_price == Decimal("255.00")

    def test_proxy_requires_enabled_auction(self):
        auction = active_auction()
        assert code(set_proxy(client_for(make_user()), auction, "200.00")) == "PROXY_NOT_ENABLED"


# --- Soft close (LX-32) --------------------------------------------------------------------


@pytest.mark.django_db
def test_soft_close_extends_and_audits():
    auction = active_auction(closing_policy="soft_close", soft_close_window_s=600, soft_close_extension_s=300)
    response = bid(client_for(make_user()), auction, "100.00")
    assert response.status_code == 201
    auction.refresh_from_db()
    # termina a los 30 min, ventana de 600 s: no extiende todavía
    assert auction.ends_at == auction.original_ends_at

    now = time_source.db_now()
    Auction.objects.filter(pk=auction.pk).update(
        ends_at=now + timedelta(seconds=60), original_ends_at=now + timedelta(seconds=60)
    )
    bid(client_for(make_user()), auction, "105.00")
    auction.refresh_from_db()
    assert auction.ends_at > auction.original_ends_at
    assert AuditEvent.objects.filter(auction_id=auction.pk, action="auction_extended").count() == 1
    detail = client_for().get(f"/api/v1/auctions/{auction.pk}/").json()
    assert detail["soft_close"]["extended"] is True


# --- Notificaciones y seguimiento (LX-33) ---------------------------------------------------


@pytest.mark.django_db
class TestNotifications:
    def test_outbid_won_lost_and_owner(self):
        auction = active_auction()
        ana, beto = make_user(), make_user()
        bid(client_for(ana), auction, "100.00")
        bid(client_for(beto), auction, "105.00")
        assert types_for(ana, auction) == ["outbid"]

        expire(auction)
        closing.close_auction(auction.pk)
        assert types_for(beto, auction) == ["auction_won"]
        assert types_for(ana, auction) == ["auction_lost", "outbid"]
        assert types_for(auction.owner_user, auction) == ["auction_closed_owner"]

    def test_notifications_never_contain_proxy_max(self):
        auction = active_auction(proxy_enabled=True)
        ana = make_user()
        set_proxy(client_for(ana), auction, "444.44")
        bid(client_for(make_user()), auction, "500.00")
        assert all("444.44" not in str(n.data) for n in Notification.objects.filter(auction_id=auction.pk))

    def test_watch_is_idempotent_and_cancel_notifies_watchers(self):
        auction = active_auction()
        fan = make_user()
        client = client_for(fan)
        assert client.put(f"/api/v1/auctions/{auction.pk}/watch/").status_code == 204
        assert client.put(f"/api/v1/auctions/{auction.pk}/watch/").status_code == 204
        assert Watchlist.objects.filter(user_id=fan.pk, auction_id=auction.pk).count() == 1
        assert client.get("/api/v1/auctions/?mine=watching").json()["count"] == 1

        client_for(auction.owner_user).post(
            f"/api/v1/auctions/{auction.pk}/cancel/", {"reason": "error"}, format="json"
        )
        assert types_for(fan, auction) == ["auction_cancelled"]
        assert client.delete(f"/api/v1/auctions/{auction.pk}/watch/").status_code == 204

    def test_job_sends_started_and_ending_once(self):
        auction = active_auction()
        fan = make_user()
        client_for(fan).put(f"/api/v1/auctions/{auction.pk}/watch/")
        now = time_source.db_now()
        Auction.objects.filter(pk=auction.pk).update(ends_at=now + timedelta(minutes=5))
        closing.notify_watchers()
        closing.notify_watchers()  # segunda pasada: no duplica
        assert types_for(fan, auction) == ["watch_auction_ending", "watch_auction_started"]

    def test_list_and_mark_read_only_own(self):
        auction = active_auction()
        ana, beto = make_user(), make_user()
        bid(client_for(ana), auction, "100.00")
        bid(client_for(beto), auction, "105.00")
        ana_client = client_for(ana)
        listed = ana_client.get("/api/v1/notifications/?unread=true").json()
        assert listed["count"] == 1 and listed["results"][0]["type"] == "outbid"
        own_id = listed["results"][0]["id"]

        other = client_for(beto).post("/api/v1/notifications/read/", {"ids": [own_id]}, format="json")
        assert other.json()["updated"] == 0  # no puede marcar notificaciones ajenas
        assert ana_client.post("/api/v1/notifications/read/", {"all": True}, format="json").json()["updated"] == 1
        assert ana_client.get("/api/v1/notifications/?unread=true").json()["count"] == 0


# --- Reportes (LX-37) ----------------------------------------------------------------------


@pytest.mark.django_db
class TestReports:
    def payload(self, target_type, target_id, reason="fraud"):
        return {"target_type": target_type, "target_id": str(target_id), "reason": reason, "detail": "sospechoso"}

    def test_report_auction_once(self):
        auction = active_auction()
        client = client_for(make_user())
        first = client.post("/api/v1/reports/", self.payload("auction", auction.pk), format="json")
        assert first.status_code == 201 and first.json()["status"] == "open"
        assert (
            code(client.post("/api/v1/reports/", self.payload("auction", auction.pk), format="json"))
            == "ALREADY_REPORTED"
        )
        assert AuditEvent.objects.filter(action="report_created", auction_id=auction.pk).count() == 1

    def test_unknown_or_invisible_targets_are_404(self):
        client = client_for(make_user())
        assert client.post("/api/v1/reports/", self.payload("auction", uuid.uuid4()), format="json").status_code == 404
        owner = make_user()
        payload = draft_payload(make_listing(owner))
        draft = client_for(owner).post("/api/v1/auctions/", payload, format="json").json()
        assert client.post("/api/v1/reports/", self.payload("auction", draft["id"]), format="json").status_code == 404

    def test_cannot_report_yourself_and_daily_limit(self, monkeypatch):
        from apps.moderation import services

        user = make_user()
        client = client_for(user)
        assert code(client.post("/api/v1/reports/", self.payload("user", user.pk), format="json")) == "VALIDATION_ERROR"
        monkeypatch.setattr(services, "MAX_REPORTS_PER_DAY", 2)
        targets = [make_user() for _ in range(3)]
        statuses = [client.post("/api/v1/reports/", self.payload("user", t.pk), format="json") for t in targets]
        assert [r.status_code for r in statuses[:2]] == [201, 201]
        assert code(statuses[2]) == "LIMIT_REACHED"

    @pytest.mark.parametrize("role", ["moderator", "admin"])
    def test_staff_does_not_use_user_reports(self, role):
        response = client_for(make_user(role)).post(
            "/api/v1/reports/", self.payload("user", uuid.uuid4()), format="json"
        )
        assert response.status_code == 403


# --- Invariante del proxy bajo concurrencia (base de LX-34) -------------------------------


@pytest.mark.django_db(transaction=True)
def test_parallel_proxies_keep_a_single_live_limit():
    auction = active_auction(proxy_enabled=True)
    users = [make_user() for _ in range(8)]
    barrier = threading.Barrier(len(users))
    errors: list = []

    def worker(user, amount):
        try:
            barrier.wait()
            bidding.set_proxy_limit(user, auction.pk, max_amount=amount)
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)
        finally:
            connection.close()

    threads = [
        threading.Thread(target=worker, args=(u, Decimal("150.00") + Decimal(i * 37))) for i, u in enumerate(users)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)

    auction.refresh_from_db()
    live = list(ProxyBidLimit.objects.filter(auction_id=auction.pk, status="active"))
    assert len(live) <= 1
    if live:
        assert str(live[0].user_id) == str(auction.leader_user_id)
        assert live[0].max_amount >= auction.current_price
    assert all(getattr(e, "code", None) == "BID_BELOW_MINIMUM" for e in errors), errors
