"""LX-53 (handoff de Frontend): la inversa se encuentra por el título de su necesidad y las vistas B2B
muestran el estado EFECTIVO (hora de PostgreSQL), no el guardado."""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from .helpers import client_for, make_user
from .test_reverse_flow import make_org, register, reverse_auction, start

pytestmark = pytest.mark.django_db


@pytest.fixture
def b2b():
    """Compradora verificada y una proveedora verificada, cada una con su usuario owner."""
    buyer, supplier = make_user(), make_user()
    return {
        "buyer": buyer,
        "buyer_org": make_org(buyer, buyer=True),
        "sup_a": supplier,
        "org_a": make_org(supplier, supplier=True),
    }


def test_catalog_search_finds_a_reverse_auction_by_its_need_title(b2b):
    auction = reverse_auction(b2b["buyer"], b2b["buyer_org"])
    ids = [row["id"] for row in APIClient().get("/api/v1/auctions/?q=resmas").json()["results"]]
    assert str(auction.pk) in ids
    ids = [row["id"] for row in APIClient().get("/api/v1/auctions/?q=no-existe-xyz").json()["results"]]
    assert str(auction.pk) not in ids


def test_b2b_views_report_the_effective_status(b2b):
    auction = reverse_auction(b2b["buyer"], b2b["buyer_org"])
    assert register(b2b["sup_a"], auction, b2b["org_a"]).status_code == 201
    need_id = auction.procurement_request_id
    buyer, supplier = client_for(b2b["buyer"]), client_for(b2b["sup_a"])

    def statuses():
        detail = APIClient().get(f"/api/v1/procurement-requests/{need_id}/").json()["auction"]["status"]
        mine = buyer.get(f"/api/v1/organizations/{b2b['buyer_org'].pk}/procurement-requests/").json()["results"]
        regs = supplier.get(f"/api/v1/organizations/{b2b['org_a'].pk}/registrations/").json()["results"]
        return detail, mine[0]["auction"]["status"], regs[0]["auction"]["status"]

    assert statuses() == ("scheduled", "scheduled", "scheduled")
    start(auction)  # starts_at en el pasado; la fila sigue guardada como `scheduled`
    auction.refresh_from_db()
    assert auction.status == "scheduled"
    assert statuses() == ("active", "active", "active")


def test_catalog_with_reverse_auctions_has_no_n_plus_one(b2b):
    """La cantidad de la necesidad se toma del select_related, no con una consulta por fila."""

    def catalog_queries():
        with CaptureQueriesContext(connection) as ctx:
            assert APIClient().get("/api/v1/auctions/?mechanism=reverse").status_code == 200
        return len(ctx.captured_queries)

    reverse_auction(b2b["buyer"], b2b["buyer_org"])
    before = catalog_queries()
    for _ in range(3):
        reverse_auction(b2b["buyer"], b2b["buyer_org"])
    assert catalog_queries() == before
