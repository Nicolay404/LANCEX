"""LX-77 / LX-79 / LX-80 (base): moderación y administración contra PostgreSQL (T12, T20)."""

import uuid

import pytest
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.models import User
from apps.audit.models import AuditEvent
from apps.auctions.models import Auction, ProxyBidLimit, SealedOffer
from apps.auctions.services import bidding
from apps.moderation.models import Report
from tests.auctions.helpers import (
    PASSWORD,
    active_auction,
    bid,
    client_for,
    draft_payload,
    make_listing,
    make_user,
)

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _relaxed(monkeypatch):
    monkeypatch.setattr(bidding, "MIN_SECONDS_BETWEEN_BIDS", 0)
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "bids", "1000/min")
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "reports", "1000/day")
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "login", "1000/min")


def code(response):
    return response.json()["code"]


def suspend(actor, target, reason="fraude comprobado"):
    return client_for(actor).post(f"/api/v1/moderation/users/{target.pk}/suspend/", {"reason": reason}, format="json")


def login(user):
    client = APIClient()
    return client.post("/api/v1/auth/login/", {"email": user.email, "password": PASSWORD}, format="json")


class TestSuspension:
    def test_effects_of_suspension(self):
        moderator = make_user("moderator")
        villain = make_user()
        # Subasta propia programada -> se cancela; borrador -> se cancela.
        draft = (
            client_for(villain).post("/api/v1/auctions/", draft_payload(make_listing(villain)), format="json").json()
        )
        # Proxy activo y oferta sellada vigente en subastas ajenas.
        proxy_auction = active_auction(proxy_enabled=True)
        client_for(villain).put(
            f"/api/v1/auctions/{proxy_auction.pk}/proxy-limit/", {"max_amount": "300.00"}, format="json"
        )
        sealed = active_auction(mechanism="sealed", min_increment=None, starting_price="50.00")
        client_for(villain).put(
            f"/api/v1/auctions/{sealed.pk}/sealed-offer/",
            {"amount": "70.00"},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )
        assert login(villain).status_code == 200

        response = suspend(moderator, villain)
        assert response.status_code == 200 and response.json()["status"] == "suspended"

        assert Auction.objects.get(pk=draft["id"]).cancel_reason == "owner_suspended"
        assert ProxyBidLimit.objects.get(auction_id=proxy_auction.pk, user_id=villain.pk).status == "cancelled"
        offer = SealedOffer.objects.get(auction_id=sealed.pk, bidder_user_id=villain.pk)
        assert (offer.status, offer.is_current) == ("withdrawn", False)
        assert Auction.objects.get(pk=sealed.pk).active_offer_count == 0
        assert code(login(villain)) == "ACCOUNT_SUSPENDED"
        event = AuditEvent.objects.get(action="user_suspended", entity_id=villain.pk)
        assert event.data["sealed_offers_withdrawn"] == 1 and "300.00" not in str(event.data)

    def test_staff_rules(self):
        moderator, other_mod, admin, other_admin = (
            make_user("moderator"),
            make_user("moderator"),
            make_user("admin"),
            make_user("admin"),
        )
        assert suspend(moderator, moderator).status_code == 403  # a sí mismo
        assert suspend(moderator, other_mod).status_code == 403  # moderador sobre staff
        assert suspend(moderator, admin).status_code == 403
        assert suspend(admin, other_admin).status_code == 403  # un admin no se suspende
        assert suspend(admin, other_mod).status_code == 200  # admin sí suspende moderadores
        assert code(suspend(admin, other_mod)) == "INVALID_STATE_TRANSITION"
        assert (
            code(
                client_for(moderator).post(
                    f"/api/v1/moderation/users/{make_user().pk}/suspend/", {"reason": ""}, format="json"
                )
            )
            == "VALIDATION_ERROR"
        )

    def test_regular_users_cannot_reach_staff_endpoints(self):
        user = client_for(make_user())
        target = make_user()
        assert (
            user.post(f"/api/v1/moderation/users/{target.pk}/suspend/", {"reason": "xxx"}, format="json").status_code
            == 403
        )
        assert user.get("/api/v1/moderation/summary/").status_code == 403
        assert user.get("/api/v1/admin/system-health/").status_code == 403
        assert client_for(make_user("moderator")).get("/api/v1/admin/users/").status_code == 403


class TestAdminUsers:
    def test_reactivate_and_role_changes(self):
        admin = make_user("admin")
        target = make_user()
        suspend(admin, target)
        client = client_for(admin)
        assert (
            client.post(f"/api/v1/admin/users/{target.pk}/reactivate/", {"reason": "apelación"}, format="json").json()[
                "status"
            ]
            == "active"
        )
        assert login(target).status_code == 200

        bad = client.post(
            f"/api/v1/admin/users/{target.pk}/role/",
            {"platform_role": "moderator", "reason": "apoyo", "password": "mala"},
            format="json",
        )
        assert code(bad) == "STEP_UP_FAILED"
        ok = client.post(
            f"/api/v1/admin/users/{target.pk}/role/",
            {"platform_role": "moderator", "reason": "apoyo", "password": PASSWORD},
            format="json",
        )
        assert ok.json()["platform_role"] == "moderator"
        assert AuditEvent.objects.filter(action="user_role_changed", entity_id=target.pk).exists()

    def test_cannot_promote_users_with_open_activity(self):
        admin = make_user("admin")
        seller = make_user()
        active_auction(seller)
        response = client_for(admin).post(
            f"/api/v1/admin/users/{seller.pk}/role/",
            {"platform_role": "moderator", "reason": "x" * 5, "password": PASSWORD},
            format="json",
        )
        assert code(response) == "OPEN_ACTIVITY"

    def test_last_admin_is_protected(self):
        for other in User.objects.filter(platform_role="admin"):
            other.platform_role = "user"
            other.save(update_fields=["platform_role"])
        admin = make_user("admin")
        response = client_for(admin).post(
            f"/api/v1/admin/users/{admin.pk}/role/",
            {"platform_role": "user", "reason": "me retiro", "password": PASSWORD},
            format="json",
        )
        assert code(response) == "LAST_ADMIN"

    def test_search_categories_audit_and_health(self):
        admin = client_for(make_user("admin"))
        target = make_user()
        found = admin.get(f"/api/v1/admin/users/?q={target.email}").json()
        assert found["count"] == 1 and found["results"][0]["email"] == target.email
        slug = f"cat-{uuid.uuid4().hex[:6]}"
        created = admin.post("/api/v1/admin/categories/", {"name": "Drones", "slug": slug}, format="json")
        assert created.status_code == 201
        assert (
            code(admin.post("/api/v1/admin/categories/", {"name": "Otra", "slug": slug}, format="json"))
            == "SLUG_ALREADY_EXISTS"
        )
        off = admin.patch(f"/api/v1/admin/categories/{created.json()['id']}/", {"is_active": False}, format="json")
        assert off.json()["is_active"] is False
        events = admin.get("/api/v1/admin/audit-events/?action=category_changed").json()
        assert events["count"] >= 2
        health = admin.get("/api/v1/admin/system-health/").json()
        assert {"server_time", "close_jobs", "pending_closes", "counts"} <= set(health)


class TestModeration:
    def test_internal_view_hides_proxy_max_and_shows_identities(self):
        auction = active_auction(proxy_enabled=True, reserve_price="900.00")
        ana = make_user()
        client_for(ana).put(f"/api/v1/auctions/{auction.pk}/proxy-limit/", {"max_amount": "456.78"}, format="json")
        bid(client_for(make_user()), auction, "150.00")
        view = client_for(make_user("moderator")).get(f"/api/v1/moderation/auctions/{auction.pk}/")
        body = view.content.decode()
        assert view.status_code == 200 and "456.78" not in body
        assert view.json()["auction"]["reserve_price"] == "900.00"
        assert ana.display_name in body

    def test_resolve_report_with_cancellation(self):
        auction = active_auction()
        reporter = client_for(make_user())
        reporter.post(
            "/api/v1/reports/",
            {"target_type": "auction", "target_id": str(auction.pk), "reason": "prohibited_item", "detail": "armas"},
            format="json",
        )
        report = Report.objects.get(target_id=auction.pk)
        moderator = client_for(make_user("moderator"))
        assert (
            code(
                moderator.post(
                    f"/api/v1/moderation/reports/{report.pk}/resolve/",
                    {"status": "actioned", "note": "ok ok", "action": "none"},
                    format="json",
                )
            )
            == "VALIDATION_ERROR"
        )
        resolved = moderator.post(
            f"/api/v1/moderation/reports/{report.pk}/resolve/",
            {"status": "actioned", "note": "Artículo prohibido", "action": "cancel_auction"},
            format="json",
        )
        assert resolved.json()["status"] == "actioned"
        assert Auction.objects.get(pk=auction.pk).status == "cancelled"
        again = moderator.post(
            f"/api/v1/moderation/reports/{report.pk}/resolve/",
            {"status": "dismissed", "note": "otra vez"},
            format="json",
        )
        assert code(again) == "INVALID_STATE_TRANSITION"
        assert moderator.get("/api/v1/moderation/summary/").json()["open_reports"] >= 0

    def test_moderator_cancel_requires_reason_and_not_closed(self):
        from tests.auctions.helpers import expire

        auction = active_auction()
        moderator = client_for(make_user("moderator"))
        expire(auction)
        closed = moderator.post(
            f"/api/v1/moderation/auctions/{auction.pk}/cancel/", {"reason": "fraude"}, format="json"
        )
        assert code(closed) == "INVALID_STATE_TRANSITION"
        fresh = active_auction()
        bid(client_for(make_user()), fresh, "100.00")
        ok = moderator.post(f"/api/v1/moderation/auctions/{fresh.pk}/cancel/", {"reason": "fraude"}, format="json")
        assert ok.json()["status"] == "cancelled"  # el moderador sí cancela con pujas

    def test_user_file_shows_email_to_staff(self):
        target = make_user()
        data = client_for(make_user("moderator")).get(f"/api/v1/moderation/users/{target.pk}/").json()
        assert data["user"]["email"] == target.email
