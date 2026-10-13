"""LX-71: liquidación, calificaciones, reputación y perfil público (REGLAS §10)."""

import pytest

from apps.auctions.services import closing
from apps.notifications.models import Notification

from .helpers import active_auction, bid, client_for, expire, make_user

pytestmark = pytest.mark.django_db


def code(response):
    return response.json()["code"]


def awarded():
    auction = active_auction()
    winner = make_user()
    bid(client_for(winner), auction, "100.00")
    expire(auction)
    closing.close_auction(auction.pk)
    return auction, winner


def settle(client, auction, status="completed", note=""):
    return client.patch(
        f"/api/v1/auctions/{auction.pk}/settlement/",
        {"settlement_status": status, "settlement_note": note},
        format="json",
    )


def rate(client, auction, score=5, comment="Todo bien"):
    return client.post(f"/api/v1/auctions/{auction.pk}/rating/", {"score": score, "comment": comment}, format="json")


def test_settlement_by_owner_once():
    auction, winner = awarded()
    owner = client_for(auction.owner_user)
    assert settle(client_for(winner), auction).status_code == 403
    assert code(settle(owner, auction, "failed")) == "VALIDATION_ERROR"  # falló sin explicar
    assert settle(owner, auction).json()["settlement_status"] == "completed"
    assert code(settle(owner, auction, "failed", "cambio de opinión")) == "INVALID_STATE_TRANSITION"


def test_ratings_both_ways_once_and_reputation():
    auction, winner = awarded()
    owner_client, winner_client = client_for(auction.owner_user), client_for(winner)
    assert code(rate(owner_client, auction)) == "INVALID_STATE_TRANSITION"  # antes de liquidar
    settle(owner_client, auction)
    assert rate(owner_client, auction, 5).status_code == 201
    assert code(rate(owner_client, auction, 4)) == "ALREADY_RATED"
    assert rate(winner_client, auction, 3).status_code == 201
    assert rate(client_for(make_user()), auction).status_code == 403
    assert Notification.objects.filter(user_id=winner.pk, type="rating_received").exists()

    profile = client_for().get(f"/api/v1/users/{winner.pk}/").json()
    assert profile == {**profile, "rating_avg": "5.0", "rating_count": 1}
    assert "email" not in profile
    seller = client_for().get(f"/api/v1/auctions/{auction.pk}/").json()["seller"]
    assert (seller["rating_avg"], seller["rating_count"]) == ("3.0", 1)


def test_unsold_has_no_settlement():
    auction = active_auction()
    expire(auction)
    closing.close_auction(auction.pk)
    assert code(settle(client_for(auction.owner_user), auction)) == "INVALID_STATE_TRANSITION"


def test_settlement_status_only_for_the_parties():
    auction, winner = awarded()
    assert client_for(winner).get(f"/api/v1/auctions/{auction.pk}/result/").json()["settlement_status"] == "pending"
    assert client_for().get(f"/api/v1/auctions/{auction.pk}/result/").json()["settlement_status"] is None
