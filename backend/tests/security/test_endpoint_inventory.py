"""Ninguna ruta sin fila en endpoint_matrix.yaml (base de QA-09; la matriz por rol completa es LX-18)."""

from pathlib import Path

import yaml

from apps.core.checks import iter_url_patterns
from apps.core.middleware import _CONVERTER

MATRIX = Path(__file__).with_name("endpoint_matrix.yaml")
ACTORS = {"visitor", "user", "buyer_member", "supplier_member", "moderator", "admin"}


def load_matrix() -> dict:
    return {row["route"]: row for row in yaml.safe_load(MATRIX.read_text(encoding="utf-8"))["endpoints"]}


def url_routes() -> set[str]:
    return {"/" + _CONVERTER.sub(r"{\1}", route) for route, _ in iter_url_patterns()}


def test_every_route_is_in_the_matrix():
    missing = url_routes() - set(load_matrix())
    assert not missing, f"Agrega estas rutas a {MATRIX.name}: {sorted(missing)}"


def test_matrix_rows_declare_every_actor():
    for route, row in load_matrix().items():
        for method, expected in row["methods"].items():
            assert set(expected) == ACTORS, f"{method} {route}: faltan actores {ACTORS - set(expected)}"
