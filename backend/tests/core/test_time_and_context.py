from datetime import datetime
from types import SimpleNamespace

import pytest

from apps.core.middleware import route_template
from apps.core.time import TimeSource


@pytest.mark.parametrize(
    ("route", "expected"),
    [
        ("api/v1/auctions/<uuid:auction_id>/bids/", "/api/v1/auctions/{auction_id}/bids/"),
        ("api/v1/users/<id>/", "/api/v1/users/{id}/"),
        ("api/v1/schema/", "/api/v1/schema/"),
    ],
)
def test_route_template_hides_identifiers(route, expected):
    request = SimpleNamespace(resolver_match=SimpleNamespace(route=route))
    assert route_template(request) == expected


def test_route_template_without_match():
    assert route_template(SimpleNamespace(resolver_match=None)) is None


@pytest.mark.django_db
def test_db_now_comes_from_postgres_and_is_timezone_aware():
    source = TimeSource()
    first = source.db_now()
    second = source.db_now()
    assert isinstance(first, datetime) and first.tzinfo is not None
    assert second >= first


@pytest.mark.django_db
def test_transaction_now_is_stable_inside_a_transaction():
    source = TimeSource()
    assert source.db_transaction_now() == source.db_transaction_now()
