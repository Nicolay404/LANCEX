"""Presupuesto de consultas por petición (handoff de Frontend sobre lentitud contra Supabase).

Contra Supabase cada consulta cuesta ~150–200 ms de ida y vuelta, así que el número de consultas
por petición ES el tiempo de respuesta. Estas pruebas fijan un techo para que un N+1 o un
throttling contra la base no vuelvan a colarse.

Se ejecutan con `DatabaseCache` como en desarrollo real (en `test.py` la caché por defecto es
`LocMemCache`), para que el coste del throttling sea visible.
"""

import pytest
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from tests.auctions.helpers import PASSWORD, active_auction, bid, client_for, make_user

pytestmark = pytest.mark.django_db

REAL_CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.db.DatabaseCache", "LOCATION": "django_cache"},
    "throttle": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "lancex-throttle"},
}


@pytest.fixture
def catalog():
    """Seis subastas activas de dueños distintos, con pujas de varios usuarios."""
    bidders = [make_user() for _ in range(3)]
    auctions = []
    for i in range(6):
        auction = active_auction()
        for j, bidder in enumerate(bidders[: 1 + i % 3]):
            assert bid(client_for(bidder), auction, f"{100 + 5 * j}.00").status_code == 201
        auctions.append(auction)
    return auctions, bidders


def logged_in(user) -> APIClient:
    """Sesión real (cookie), como el navegador: incluye la consulta de sesión y de usuario."""
    client = APIClient()
    assert client.login(email=user.email, password=PASSWORD)
    return client


def count(client, path) -> int:
    with CaptureQueriesContext(connection) as ctx:
        response = client.get(path)
    assert response.status_code == 200, (path, response.status_code, response.content[:200])
    return len(ctx.captured_queries)


# Techos medidos el 2026-10-13 tras mover el throttling a memoria y agrupar el panel
# (antes: categories 13, auctions 15, detalle 17, live 14, auth/me 12, me/summary 30, participations 17).
# Con sesión real hay ~4 consultas fijas: sesión, usuario, membresías y hora de PostgreSQL.
BUDGET = [
    ("anon", "/api/v1/categories/", 1),
    ("anon", "/api/v1/auctions/", 3),
    ("anon", "/api/v1/auctions/{first}/", 5),
    ("anon", "/api/v1/auctions/{first}/live/", 2),
    ("user", "/api/v1/auctions/", 5),
    ("user", "/api/v1/auth/me/", 6),
    ("user", "/api/v1/me/summary/", 11),
    ("user", "/api/v1/me/activity/", 6),
    ("user", "/api/v1/me/participations/", 9),
    ("user", "/api/v1/notifications/?unread=true", 5),
    ("user", "/api/v1/auctions/?mine=participating", 5),
]


@override_settings(CACHES=REAL_CACHES)
def test_each_endpoint_stays_within_its_query_budget(catalog):
    auctions, bidders = catalog
    clients = {"anon": APIClient(), "user": logged_in(bidders[0])}
    over = []
    for who, path, ceiling in BUDGET:
        url = path.format(first=auctions[0].pk)
        used = count(clients[who], url)
        if used > ceiling:
            over.append(f"{who} {path}: {used} consultas (techo {ceiling})")
    assert not over, "\n".join(over)


@override_settings(CACHES=REAL_CACHES)
def test_lists_do_not_grow_with_the_number_of_rows(catalog):
    """Sin N+1: duplicar subastas y participaciones no cambia el número de consultas."""
    _, bidders = catalog
    user = logged_in(bidders[0])
    paths = [
        (APIClient(), "/api/v1/auctions/"),
        (user, "/api/v1/me/participations/"),
        (user, "/api/v1/me/summary/"),
        (user, "/api/v1/me/activity/"),
    ]
    before = [count(c, p) for c, p in paths]
    for _ in range(6):
        assert bid(client_for(bidders[0]), active_auction(), "100.00").status_code == 201
    after = [count(c, p) for c, p in paths]
    assert after == before, list(zip([p for _, p in paths], before, after, strict=True))


@override_settings(CACHES=REAL_CACHES)
def test_general_throttles_never_touch_the_database():
    """anon/user se cuentan en memoria; login sigue en la caché compartida (tabla django_cache)."""
    with CaptureQueriesContext(connection) as ctx:
        assert APIClient().get("/api/v1/categories/").status_code == 200
    assert not [q for q in ctx.captured_queries if "django_cache" in q["sql"]]

    with CaptureQueriesContext(connection) as ctx:
        APIClient().post("/api/v1/auth/login/", {"email": "nadie@example.com", "password": "x"}, format="json")
    assert [q for q in ctx.captured_queries if "django_cache" in q["sql"]]
