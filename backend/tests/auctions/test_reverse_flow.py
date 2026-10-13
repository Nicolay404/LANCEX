"""Fase 5 contra PostgreSQL: organizaciones (LX-50), necesidades e inversa B2B (LX-51, LX-52),
autorización por membresía (LX-54) y verificación por moderador."""

import uuid
from datetime import timedelta

import pytest
from rest_framework.throttling import ScopedRateThrottle

from apps.auctions.models import Auction, AuctionParticipant
from apps.auctions.services import bidding, closing, participants
from apps.audit.models import AuditEvent
from apps.core.time import time_source
from apps.notifications.models import Notification
from apps.organizations.models import Organization, OrganizationMembership

from .helpers import PASSWORD, client_for, make_user

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _relaxed(monkeypatch):
    monkeypatch.setattr(bidding, "MIN_SECONDS_BETWEEN_BIDS", 0)
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "bids", "1000/min")


def code(response):
    return response.json()["code"]


def ruc() -> str:
    return str(uuid.uuid4().int)[:13]


def make_org(owner, *, buyer=False, supplier=False, verified=True) -> Organization:
    response = client_for(owner).post(
        "/api/v1/organizations/",
        {"legal_name": f"Org {uuid.uuid4().hex[:6]}", "ruc": ruc(), "is_buyer": buyer, "is_supplier": supplier},
        format="json",
    )
    assert response.status_code == 201, response.content
    org = Organization.objects.get(pk=response.json()["id"])
    if verified:
        moderator = client_for(make_user("moderator"))
        decided = moderator.post(
            f"/api/v1/moderation/organizations/{org.pk}/decision/",
            {"status": "verified", "note": "RUC revisado"},
            format="json",
        )
        assert decided.status_code == 200
    return org


def make_need(user, org, requirements=({"code": "R1", "description": "Certificado de calidad"},)):
    now = time_source.db_now()
    response = client_for(user).post(
        "/api/v1/procurement-requests/",
        {
            "organization_id": str(org.pk),
            "title": "Resmas de papel A4",
            "specifications": "75 g/m2",
            "quantity": "100.000",
            "unit": "unidad",
            "mandatory_requirements": list(requirements),
            "delivery_deadline": (now + timedelta(days=30)).date().isoformat(),
            "delivery_location": "Loja",
        },
        format="json",
    )
    assert response.status_code == 201, response.content
    return response.json()["id"]


def reverse_auction(buyer_user, buyer_org, **overrides):
    """Inversa publicada que empieza en 30 min (fase de inscripción abierta)."""
    need = make_need(buyer_user, buyer_org)
    now = time_source.db_now()
    payload = {
        "mechanism": "reverse",
        "closing_policy": "fixed",
        "organization_id": str(buyer_org.pk),
        "procurement_request_id": need,
        "reference_budget": "12000.00",
        "min_decrement": "50.00",
        "starts_at": (now + timedelta(minutes=30)).isoformat(),
        "ends_at": (now + timedelta(hours=2)).isoformat(),
        **overrides,
    }
    client = client_for(buyer_user)
    created = client.post("/api/v1/auctions/", payload, format="json")
    assert created.status_code == 201, created.content
    assert client.post(f"/api/v1/auctions/{created.json()['id']}/publish/").status_code == 200
    return Auction.objects.get(pk=created.json()["id"])


def start(auction):
    now = time_source.db_now()
    Auction.objects.filter(pk=auction.pk).update(starts_at=now - timedelta(minutes=1))


def expire(auction):
    now = time_source.db_now()
    Auction.objects.filter(pk=auction.pk).update(starts_at=now - timedelta(hours=1), ends_at=now - timedelta(seconds=1))


def register(user, auction, org, complies=True):
    return client_for(user).post(
        f"/api/v1/auctions/{auction.pk}/participants/",
        {"organization_id": str(org.pk), "compliance": [{"code": "R1", "complies": complies, "comment": "ok"}]},
        format="json",
    )


def decide(user, auction, participant_id, status, reason=""):
    return client_for(user).post(
        f"/api/v1/auctions/{auction.pk}/participants/{participant_id}/decision/",
        {"status": status, "reason": reason},
        format="json",
    )


def offer(user, auction, unit_price, shipping="0.00", key=None, org=None):
    payload = {"unit_price": unit_price, "shipping_cost": shipping}
    if org is not None:
        payload["organization_id"] = str(org.pk)
    return client_for(user).post(
        f"/api/v1/auctions/{auction.pk}/bids/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4())
    )


@pytest.fixture
def b2b():
    """Compradora verificada y dos proveedoras verificadas, cada una con su usuario owner."""
    buyer, sup_a, sup_b = make_user(), make_user(), make_user()
    return {
        "buyer": buyer,
        "buyer_org": make_org(buyer, buyer=True),
        "sup_a": sup_a,
        "org_a": make_org(sup_a, supplier=True),
        "sup_b": sup_b,
        "org_b": make_org(sup_b, supplier=True),
    }


def admitted_auction(b2b):
    auction = reverse_auction(b2b["buyer"], b2b["buyer_org"])
    for user, org in ((b2b["sup_a"], b2b["org_a"]), (b2b["sup_b"], b2b["org_b"])):
        pid = register(user, auction, org).json()["id"]
        assert decide(b2b["buyer"], auction, pid, "admitted").status_code == 200
    start(auction)
    return auction


# --- Organizaciones (LX-50) --------------------------------------------------------------------


class TestOrganizations:
    def test_create_view_and_hide_from_others(self):
        owner = make_user()
        org = make_org(owner, buyer=True, verified=False)
        detail = client_for(owner).get(f"/api/v1/organizations/{org.pk}/").json()
        assert detail["my_role"] == "owner" and detail["verification_status"] == "pending"
        assert "email" not in str(detail["members"])
        other = make_user()
        make_org(other, supplier=True, verified=False)
        assert client_for(other).get(f"/api/v1/organizations/{org.pk}/").status_code == 404
        me = client_for(owner).get("/api/v1/auth/me/").json()
        assert me["organizations"][0]["capabilities"] == [
            "org.edit_profile",
            "org.manage_members",
            "org.transfer_ownership",
            "org.view",
        ]

    def test_ruc_is_unique_and_validated(self):
        owner = make_user()
        org = make_org(owner, buyer=True, verified=False)
        dup = client_for(make_user()).post(
            "/api/v1/organizations/",
            {"legal_name": "Otra", "ruc": org.ruc, "is_buyer": True, "is_supplier": False},
            format="json",
        )
        assert code(dup) == "RUC_ALREADY_REGISTERED"
        bad = client_for(owner).post(
            "/api/v1/organizations/",
            {"legal_name": "X S.A.", "ruc": "123", "is_buyer": True, "is_supplier": False},
            format="json",
        )
        assert code(bad) == "VALIDATION_ERROR"

    def test_identity_change_returns_verified_org_to_pending(self):
        owner = make_user()
        org = make_org(owner, buyer=True)
        client = client_for(owner)
        same = client.patch(f"/api/v1/organizations/{org.pk}/", {"is_supplier": True}, format="json")
        assert same.json()["verification_status"] == "verified"
        changed = client.patch(f"/api/v1/organizations/{org.pk}/", {"legal_name": "Nueva S.A."}, format="json")
        assert changed.json()["verification_status"] == "pending"

    def test_members_last_owner_and_transfer(self):
        owner, member = make_user(), make_user()
        org = make_org(owner, buyer=True)
        client = client_for(owner)
        assert (
            client.post(f"/api/v1/organizations/{org.pk}/members/", {"email": member.email}, format="json").status_code
            == 201
        )
        again = client.post(f"/api/v1/organizations/{org.pk}/members/", {"email": member.email}, format="json")
        assert code(again) == "ALREADY_MEMBER"
        unknown = client.post(f"/api/v1/organizations/{org.pk}/members/", {"email": "nadie@example.com"}, format="json")
        assert code(unknown) == "VALIDATION_ERROR"
        staff = client.post(
            f"/api/v1/organizations/{org.pk}/members/", {"email": make_user("admin").email}, format="json"
        )
        assert code(staff) == "VALIDATION_ERROR"  # staff no pertenece a organizaciones

        assert code(client.delete(f"/api/v1/organizations/{org.pk}/members/{owner.pk}/")) == "LAST_OWNER"
        assert (
            client_for(member)
            .post(f"/api/v1/organizations/{org.pk}/members/", {"email": make_user().email}, format="json")
            .status_code
            == 403
        )  # un member no gestiona miembros

        wrong = client.post(
            f"/api/v1/organizations/{org.pk}/transfer-ownership/",
            {"new_owner_user_id": str(member.pk), "password": "mala"},
            format="json",
        )
        assert code(wrong) == "STEP_UP_FAILED"
        ok = client.post(
            f"/api/v1/organizations/{org.pk}/transfer-ownership/",
            {"new_owner_user_id": str(member.pk), "password": PASSWORD},
            format="json",
        )
        assert ok.json()["my_role"] == "member"
        assert client.delete(f"/api/v1/organizations/{org.pk}/members/{member.pk}/").status_code == 403
        assert client_for(member).delete(f"/api/v1/organizations/{org.pk}/members/{owner.pk}/").status_code == 204
        assert OrganizationMembership.objects.get(organization=org, user=owner).status == "revoked"

    def test_only_staff_verifies(self):
        owner = make_user()
        org = make_org(owner, buyer=True, verified=False)
        user_try = client_for(make_user()).post(
            f"/api/v1/moderation/organizations/{org.pk}/decision/",
            {"status": "verified", "note": "me verifico"},
            format="json",
        )
        assert user_try.status_code == 403
        listed = client_for(make_user("admin")).get("/api/v1/moderation/organizations/?status=pending").json()
        assert str(org.pk) in {o["id"] for o in listed["results"]}
        assert AuditEvent.objects.filter(entity_id=org.pk, action="organization_created").exists()


# --- Necesidades e inversa (LX-51) ---------------------------------------------------------------


class TestProcurement:
    def test_only_verified_buyer_members_publish_needs(self, b2b):
        assert make_need(b2b["buyer"], b2b["buyer_org"])
        pending = make_org(make_user(), buyer=True, verified=False)
        owner = OrganizationMembership.objects.get(organization=pending, role="owner").user
        response = client_for(owner).post(
            "/api/v1/procurement-requests/",
            {
                "organization_id": str(pending.pk),
                "title": "x",
                "specifications": "y",
                "quantity": "1",
                "unit": "u",
                "delivery_deadline": "2099-01-01",
                "delivery_location": "Loja",
            },
            format="json",
        )
        assert response.status_code == 403
        supplier_try = client_for(b2b["sup_a"]).post(
            "/api/v1/procurement-requests/",
            {
                "organization_id": str(b2b["org_a"].pk),
                "title": "x",
                "specifications": "y",
                "quantity": "1",
                "unit": "u",
                "delivery_deadline": "2099-01-01",
                "delivery_location": "Loja",
            },
            format="json",
        )
        assert supplier_try.status_code == 403

    def test_need_detail_is_public(self, b2b):
        need = make_need(b2b["buyer"], b2b["buyer_org"])
        assert client_for().get(f"/api/v1/procurement-requests/{need}/").json()["quantity"] == "100.000"


class TestReverseLifecycle:
    def test_registration_conflicts_and_decisions(self, b2b):
        auction = reverse_auction(b2b["buyer"], b2b["buyer_org"])
        registered = register(b2b["sup_a"], auction, b2b["org_a"])
        assert registered.status_code == 201 and registered.json()["status"] == "registered"
        assert code(register(b2b["sup_a"], auction, b2b["org_a"])) == "ALREADY_REGISTERED"

        # La compradora no puede inscribirse a sí misma ni un miembro suyo inscribir proveedores.
        both = make_org(b2b["buyer"], supplier=True)
        assert code(register(b2b["buyer"], auction, both)) == "CONFLICT_OF_INTEREST"

        bad_compliance = client_for(b2b["sup_b"]).post(
            f"/api/v1/auctions/{auction.pk}/participants/",
            {"organization_id": str(b2b["org_b"].pk), "compliance": []},
            format="json",
        )
        assert code(bad_compliance) == "VALIDATION_ERROR"

        pid = registered.json()["id"]
        assert code(decide(b2b["buyer"], auction, pid, "rejected")) == "VALIDATION_ERROR"  # falta motivo
        assert decide(b2b["sup_b"], auction, pid, "admitted").status_code == 403  # no es la compradora
        assert decide(b2b["buyer"], auction, pid, "admitted").json()["status"] == "admitted"
        assert Notification.objects.filter(user_id=b2b["sup_a"].pk, type="participant_admitted").exists()

        # Cada proveedor ve solo lo suyo; la compradora, todo.
        register(b2b["sup_b"], auction, b2b["org_b"])
        assert len(client_for(b2b["buyer"]).get(f"/api/v1/auctions/{auction.pk}/participants/").json()["results"]) == 2
        assert len(client_for(b2b["sup_a"]).get(f"/api/v1/auctions/{auction.pk}/participants/").json()["results"]) == 1

    def test_unreviewed_registrations_freeze_as_rejected(self, b2b):
        auction = reverse_auction(b2b["buyer"], b2b["buyer_org"])
        register(b2b["sup_a"], auction, b2b["org_a"])
        start(auction)
        listed = client_for(b2b["buyer"]).get(f"/api/v1/auctions/{auction.pk}/participants/").json()["results"]
        assert listed[0]["status"] == "rejected" and listed[0]["decision_reason"] == "not_reviewed"
        assert participants.freeze_unreviewed() >= 1
        assert AuctionParticipant.objects.get(auction_id=auction.pk).decision_reason == "not_reviewed"
        late = register(b2b["sup_b"], auction, b2b["org_b"])
        assert code(late) == "INVALID_STATE_TRANSITION"

    def test_bidding_rules_and_total_formula(self, b2b):
        auction = admitted_auction(b2b)
        first = offer(b2b["sup_a"], auction, "119.5000", "25.00")  # 11 975.00
        assert first.status_code == 201
        assert first.json()["bid"]["amount"] == "11975.00"

        assert code(offer(b2b["sup_a"], auction, "100.0000")) == "ALREADY_LEADING"
        above = offer(b2b["sup_b"], auction, "119.2600")  # 11 926.00 > 11 925.00
        assert code(above) == "OFFER_ABOVE_MAXIMUM"
        assert above.json()["details"]["maximum_allowed"] == "11925.00"
        assert offer(b2b["sup_b"], auction, "119.2500").status_code == 201  # exactamente el máximo

        outsider = make_user()
        outsider_org = make_org(outsider, supplier=True)
        assert code(offer(outsider, auction, "50.0000")) == "NOT_ADMITTED"
        assert outsider_org  # verificada pero no inscrita
        assert code(offer(b2b["buyer"], auction, "50.0000")) == "BID_ON_OWN_AUCTION"
        precision = offer(b2b["sup_a"], auction, "1.12345")
        assert code(precision) == "INVALID_AMOUNT_PRECISION"

    def test_visibility_during_and_after(self, b2b):
        auction = admitted_auction(b2b)
        offer(b2b["sup_a"], auction, "119.0000")
        offer(b2b["sup_b"], auction, "118.0000")

        mine = client_for(b2b["sup_a"]).get(f"/api/v1/auctions/{auction.pk}/bids/").json()["results"]
        assert [i["bidder"] for i in mine] == ["Proveedor 2", "Tu organización"]
        assert "unit_price" in mine[1] and "unit_price" not in mine[0]  # desglose solo propio
        buyer_view = client_for(b2b["buyer"]).get(f"/api/v1/auctions/{auction.pk}/bids/").json()["results"]
        assert all("bidder_identity" not in i for i in buyer_view)  # seudónimos hasta el cierre
        assert b2b["org_a"].legal_name not in client_for().get(f"/api/v1/auctions/{auction.pk}/bids/").content.decode()

        live = client_for(b2b["sup_a"]).get(f"/api/v1/auctions/{auction.pk}/live/").json()
        assert live["current_price"] == "11800.00" and live["viewer_is_leader"] is False
        assert live["maximum_allowed"] == "11750.00"

        expire(auction)
        closing.close_auction(auction.pk)
        auction.refresh_from_db()
        assert str(auction.winner_organization_id) == str(b2b["org_b"].pk)
        result = client_for().get(f"/api/v1/auctions/{auction.pk}/result/").json()
        assert result["winner_organization"]["legal_name"] == b2b["org_b"].legal_name
        assert result["final_price"] == "11800.00"
        after = client_for(b2b["buyer"]).get(f"/api/v1/auctions/{auction.pk}/bids/").json()["results"]
        assert after[0]["bidder_identity"]["organization_id"] == str(b2b["org_b"].pk)

    def test_buyer_members_manage_and_deserted(self, b2b):
        auction = reverse_auction(b2b["buyer"], b2b["buyer_org"])
        colleague = make_user()
        client_for(b2b["buyer"]).post(
            f"/api/v1/organizations/{b2b['buyer_org'].pk}/members/", {"email": colleague.email}, format="json"
        )
        cancel = client_for(colleague).post(
            f"/api/v1/auctions/{auction.pk}/cancel/", {"reason": "error"}, format="json"
        )
        assert cancel.json()["status"] == "cancelled"  # cualquier miembro activo de la compradora gestiona

        deserted = reverse_auction(b2b["buyer"], b2b["buyer_org"])
        expire(deserted)
        closing.close_auction(deserted.pk)
        assert Auction.objects.get(pk=deserted.pk).outcome == "unsold"

    def test_one_open_auction_per_need(self, b2b):
        auction = reverse_auction(b2b["buyer"], b2b["buyer_org"])
        now = time_source.db_now()
        again = client_for(b2b["buyer"]).post(
            "/api/v1/auctions/",
            {
                "mechanism": "reverse",
                "closing_policy": "fixed",
                "organization_id": str(b2b["buyer_org"].pk),
                "procurement_request_id": str(auction.procurement_request_id),
                "reference_budget": "100.00",
                "min_decrement": "1.00",
                "starts_at": (now + timedelta(minutes=30)).isoformat(),
                "ends_at": (now + timedelta(hours=2)).isoformat(),
            },
            format="json",
        )
        assert code(again) == "PROCUREMENT_HAS_AUCTION"
