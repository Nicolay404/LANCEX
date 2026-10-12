"""Utilidades para pruebas de subastas contra el PostgreSQL local (horas siempre de la base)."""

import uuid
from datetime import timedelta

from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.auctions.models import Auction
from apps.catalog.models import Category, Listing
from apps.core.time import time_source

PASSWORD = "Prueba-Larga-123"


def make_user(role: str = "user") -> User:
    return User.objects.create_user(
        email=f"t-{uuid.uuid4().hex[:12]}@example.com",
        password=PASSWORD,
        display_name=f"Tester {uuid.uuid4().hex[:4]}",
        platform_role=role,
    )


def client_for(user=None) -> APIClient:
    client = APIClient()
    if user is not None:
        client.force_authenticate(user)
    return client


def make_listing(owner: User) -> Listing:
    slug = f"c-{uuid.uuid4().hex[:8]}"
    category = Category.objects.create(name=slug, slug=slug)
    return Listing.objects.create(
        owner_user=owner,
        category=category,
        title="Laptop",
        description="Buena",
        item_condition="used",
        location_city="Loja",
    )


def draft_payload(listing: Listing, **overrides) -> dict:
    now = time_source.db_now()
    payload = {
        "mechanism": "ascending",
        "closing_policy": "fixed",
        "listing_id": str(listing.pk),
        "starting_price": "100.00",
        "min_increment": "5.00",
        "starts_at": (now - timedelta(minutes=1)).isoformat(),
        "ends_at": (now + timedelta(minutes=30)).isoformat(),
    }
    payload.update(overrides)
    return payload


def active_auction(owner: User | None = None, **overrides) -> Auction:
    """Crea y publica por la API: queda activa de inmediato (starts_at se ajusta a la publicación)."""
    owner = owner or make_user()
    client = client_for(owner)
    created = client.post("/api/v1/auctions/", draft_payload(make_listing(owner), **overrides), format="json")
    assert created.status_code == 201, created.content
    published = client.post(f"/api/v1/auctions/{created.json()['id']}/publish/")
    assert published.status_code == 200, published.content
    return Auction.objects.get(pk=created.json()["id"])


def expire(auction: Auction) -> None:
    """Simula que el tiempo pasó: mueve la ventana al pasado según el reloj de PostgreSQL."""
    now = time_source.db_now()
    Auction.objects.filter(pk=auction.pk).update(
        starts_at=now - timedelta(minutes=10), ends_at=now - timedelta(seconds=1)
    )


def bid(client: APIClient, auction, amount: str, key: str | None = None):
    return client.post(
        f"/api/v1/auctions/{auction.pk}/bids/",
        {"amount": amount},
        format="json",
        HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4()),
    )
