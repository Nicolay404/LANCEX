"""Barrido de autorización por rol sobre TODO el inventario de endpoints (SEGURIDAD §5, QA-09; auditoría D6).

Para cada ruta y método de `endpoint_matrix.yaml`, y para cada actor cuya respuesta esperada es 401 o 403,
se llama al endpoint con identificadores inventados y se exige exactamente ese código. Funciona sin crear
objetos porque el permiso se evalúa ANTES de buscar el recurso (DenyAll + capacidades, ADR-0006).

Los códigos que dependen del objeto (200/201/204/404) se cubren en las pruebas de cada funcionalidad.
"""

import uuid
from pathlib import Path

import pytest
import yaml
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from tests.auctions.helpers import make_user

pytestmark = pytest.mark.django_db

MATRIX = Path(__file__).with_name("endpoint_matrix.yaml")
SWEPT_ACTORS = ("visitor", "user", "moderator", "admin")
DENIED = {401, 403}


def _cases():
    rows = yaml.safe_load(MATRIX.read_text(encoding="utf-8"))["endpoints"]
    for row in rows:
        object_level = set(row.get("object_level_for", []))
        for method, expected in row["methods"].items():
            for actor in SWEPT_ACTORS:
                if expected[actor] in DENIED and actor not in object_level:
                    yield pytest.param(
                        row["route"], method, actor, expected[actor], id=f"{actor}-{method}-{row['route']}"
                    )


def _concrete(route: str) -> str:
    path = route
    for placeholder in ("{category_id}",):
        path = path.replace(placeholder, "999999")
    while "{" in path:
        start, end = path.index("{"), path.index("}")
        path = path[:start] + str(uuid.uuid4()) + path[end + 1 :]
    return path


@pytest.fixture(autouse=True)
def _no_throttling(monkeypatch):
    # Cientos de peticiones seguidas: el throttling no es lo que se prueba aquí.
    for scope in ("anon", "user", "login", "register", "bids", "reports"):
        monkeypatch.setitem(SimpleRateThrottle.THROTTLE_RATES, scope, "100000/min")


@pytest.fixture(scope="module")
def clients(django_db_blocker):
    with django_db_blocker.unblock():
        actors = {
            "visitor": None,
            "user": make_user(),
            "moderator": make_user("moderator"),
            "admin": make_user("admin"),
        }
    result = {}
    for name, user in actors.items():
        client = APIClient()
        if user is not None:
            client.force_authenticate(user)
        result[name] = client
    return result


@pytest.mark.parametrize(("route", "method", "actor", "expected"), list(_cases()))
def test_every_protected_endpoint_denies_each_role(clients, route, method, actor, expected):
    response = getattr(clients[actor], method.lower())(_concrete(route), {}, format="json")
    assert response.status_code == expected, (
        f"{actor} {method} {route}: esperado {expected}, recibido {response.status_code} {response.content[:200]!r}"
    )


def test_the_sweep_covers_a_meaningful_number_of_cases():
    cases = list(_cases())
    assert len(cases) >= 150, len(cases)
    assert {c.values[2] for c in cases} == set(SWEPT_ACTORS)


@pytest.fixture
def foreign_awarded_auction():
    """Subasta adjudicada de OTRO dueño (para las denegaciones que dependen del objeto)."""
    from apps.auctions.services import closing
    from tests.auctions.helpers import active_auction, bid, client_for, expire

    auction = active_auction()
    bid(client_for(make_user()), auction, "100.00")
    expire(auction)
    closing.close_auction(auction.pk)
    return auction


@pytest.mark.parametrize(
    ("method", "suffix", "body"),
    [
        ("patch", "", {"title": "mío"}),
        ("post", "publish/", {}),
        ("post", "cancel/", {"reason": "no es mía"}),
        ("patch", "settlement/", {"settlement_status": "completed"}),
        ("post", "rating/", {"score": 5}),
    ],
)
def test_object_level_denials_on_someone_elses_auction(foreign_awarded_auction, method, suffix, body):
    """Las filas `object_level_for` de la matriz: un usuario con la capacidad, pero sin ser dueño -> 403."""
    intruder = APIClient()
    intruder.force_authenticate(make_user())
    response = getattr(intruder, method)(f"/api/v1/auctions/{foreign_awarded_auction.pk}/{suffix}", body, format="json")
    assert response.status_code == 403, response.content
