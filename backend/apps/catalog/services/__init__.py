"""Casos de uso del catálogo: publicaciones del usuario (LX-12).

Revalidan dueño y estado aunque la vista ya lo haya hecho (ADR-0006 §1): también los llaman
comandos y pruebas.
"""

from __future__ import annotations

from django.db import transaction

from apps.accounts.models import User
from apps.auctions.services.listing_guard import listing_has_open_auction
from apps.catalog.models import Category, Listing
from apps.core.capabilities import AccountStatus, PlatformRole
from apps.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from apps.core.models import ClockTimestamp

MAX_LISTINGS_PER_USER = 50  # REGLAS-DE-SUBASTAS.md §13
EDITABLE_FIELDS = ("category_id", "title", "description", "item_condition", "location_city")


def active_categories():
    return Category.objects.filter(is_active=True).order_by("name")


def _active_category(category_id: int) -> Category:
    category = Category.objects.filter(pk=category_id, is_active=True).first()
    if category is None:
        raise ValidationFailed(details={"fields": {"category_id": ["La categoría no existe o no está activa."]}})
    return category


def _ensure_can_sell(user: User) -> None:
    if user.platform_role != PlatformRole.USER or user.status != AccountStatus.ACTIVE or not user.is_active:
        raise Forbidden()


def create_listing(user: User, *, category_id: int, **fields) -> Listing:
    _ensure_can_sell(user)
    category = _active_category(category_id)
    with transaction.atomic():
        # Bloquea la fila del usuario: dos creaciones simultáneas no superan el límite.
        User.objects.select_for_update().only("id").get(pk=user.pk)
        if Listing.objects.filter(owner_user_id=user.pk).count() >= MAX_LISTINGS_PER_USER:
            raise Conflict(
                code="LIMIT_REACHED",
                message="Alcanzaste el máximo de publicaciones.",
                details={"limit": MAX_LISTINGS_PER_USER},
            )
        return Listing.objects.create(owner_user_id=user.pk, category=category, **fields)


def own_listings(user: User):
    """`/mis-publicaciones`: solo las propias (visible_to), las más recientes primero."""
    return Listing.objects.visible_to(user).select_related("category").order_by("-updated_at", "id")


def listing_overview(listings) -> dict[str, dict]:
    """Datos por publicación calculados en lote (sin N+1): editable y su última subasta."""
    from apps.auctions.models import Auction
    from apps.auctions.services.listing_guard import OPEN_AUCTION_STATUSES

    ids = [listing.pk for listing in listings]
    latest: dict[str, dict] = {}
    for a in (
        Auction.objects.filter(listing_id__in=ids)
        .order_by("listing_id", "-created_at")
        .values("id", "listing_id", "status", "mechanism")
    ):
        latest.setdefault(str(a["listing_id"]), a)
    return {
        str(listing_id): {
            "editable": latest.get(str(listing_id), {}).get("status") not in OPEN_AUCTION_STATUSES,
            "latest_auction": (
                {
                    "id": str(latest[str(listing_id)]["id"]),
                    "status": latest[str(listing_id)]["status"],
                    "mechanism": latest[str(listing_id)]["mechanism"],
                }
                if str(listing_id) in latest
                else None
            ),
        }
        for listing_id in ids
    }


def get_own_listing(user: User, listing_id) -> Listing:
    listing = Listing.objects.visible_to(user).select_related("category").filter(pk=listing_id).first()
    if listing is None:
        raise NotFound()
    return listing


def is_editable(listing: Listing) -> bool:
    return not listing_has_open_auction(listing.pk)


def update_listing(user: User, listing_id, **changes) -> Listing:
    _ensure_can_sell(user)
    if "category_id" in changes:
        _active_category(changes["category_id"])
    unknown = set(changes) - set(EDITABLE_FIELDS)
    if unknown:
        raise ValidationFailed(details={"fields": {name: ["Campo no editable."] for name in sorted(unknown)}})

    with transaction.atomic():
        listing = Listing.objects.visible_to(user).select_for_update().filter(pk=listing_id).first()
        if listing is None:
            raise NotFound()
        if listing_has_open_auction(listing.pk):
            raise Conflict(
                code="LISTING_LOCKED",
                message="La publicación tiene una subasta abierta y no se puede editar.",
            )
        if changes:
            Listing.objects.filter(pk=listing.pk).update(**changes, updated_at=ClockTimestamp())
    return get_own_listing(user, listing_id)
