"""Lecturas de subastas: catálogo, historial y datos del espectador (LX-24).

Todo parte de `Auction.objects.visible_to(user)`; nada se filtra en el frontend (ADR-0006).
"""

from __future__ import annotations

from datetime import datetime, timedelta

from django.db import connection
from django.db.models import Q, QuerySet
from django.db.models.expressions import RawSQL

from apps.auctions.domain.state import Status
from apps.auctions.models import Auction, Bid
from apps.core.errors import AuthenticationRequired, NotFound, ValidationFailed

ENDING_SOON = timedelta(hours=1)
ORDERINGS = {"ends_at": "ends_at", "-created_at": "-created_at", "current_price": "current_price"}
OPEN_PUBLISHED = (Status.SCHEDULED, Status.ACTIVE)


def get_visible(user, auction_id) -> Auction:
    auction = (
        Auction.objects.visible_to(user)
        .select_related("listing__category", "procurement_request__buyer_organization")
        .filter(pk=auction_id)
        .first()
    )
    if auction is None:
        raise NotFound()
    return auction


def effective_status_filter(status: str, now: datetime) -> Q:
    """Traduce el estado efectivo a SQL con la hora de PostgreSQL (cierre fijo)."""
    if status == Status.SCHEDULED:
        return Q(status__in=OPEN_PUBLISHED, starts_at__gt=now)
    if status == Status.ACTIVE:
        return Q(status__in=OPEN_PUBLISHED, starts_at__lte=now, ends_at__gt=now)
    if status == Status.CLOSED:
        return Q(status=Status.CLOSED) | Q(status__in=OPEN_PUBLISHED, ends_at__lte=now)
    if status == Status.CANCELLED:
        return Q(status=Status.CANCELLED)
    if status == Status.DRAFT:
        return Q(status=Status.DRAFT)
    raise ValidationFailed(details={"fields": {"status": ["Estado no válido."]}})


def catalog(user, params, now: datetime) -> QuerySet:
    qs = Auction.objects.visible_to(user).select_related("listing__category", "procurement_request__buyer_organization")
    mine = params.get("mine")
    if mine:
        if user is None or not user.is_authenticated:
            raise AuthenticationRequired()
        if mine == "owner":
            qs = qs.filter(owner_user_id=user.pk)
        elif mine == "participating":
            qs = qs.filter(pk__in=Bid.objects.filter(bidder_user_id=user.pk).values("auction_id"))
        elif mine == "watching":
            qs = qs.filter(pk__in=RawSQL("SELECT auction_id FROM watchlist WHERE user_id = %s", [user.pk]))
        else:
            raise ValidationFailed(details={"fields": {"mine": ["Usa owner, participating o watching."]}})
    organization = params.get("organization")
    if organization:
        # Panel de la organización: solo para sus miembros activos (incluye sus borradores).
        from apps.organizations import services as organizations

        if organizations.active_membership(user, organization) is None:
            raise NotFound()
        qs = qs.filter(organization_id=organization)
    if mine != "owner" and not organization:
        qs = qs.exclude(status=Status.DRAFT)  # el catálogo público nunca lista borradores
    if seller := params.get("seller"):
        # Perfil público: subastas públicas del vendedor (nunca sus borradores).
        qs = qs.filter(owner_user_id=seller).exclude(status=Status.DRAFT)

    if status := params.get("status"):
        qs = qs.filter(effective_status_filter(status, now))
    if mechanism := params.get("mechanism"):
        qs = qs.filter(mechanism=mechanism)
    if category := params.get("category"):
        if not str(category).isdigit():
            raise ValidationFailed(details={"fields": {"category": ["Debe ser un número."]}})
        qs = qs.filter(listing__category_id=int(category))
    if q := (params.get("q") or "").strip():
        qs = qs.filter(listing__title__icontains=q[:100])
    if params.get("ending_soon") == "true":
        qs = qs.filter(effective_status_filter(Status.ACTIVE, now), ends_at__lte=now + ENDING_SOON)

    ordering = params.get("ordering", "ends_at")
    if ordering not in ORDERINGS:
        raise ValidationFailed(details={"fields": {"ordering": [f"Usa {', '.join(ORDERINGS)}."]}})
    return qs.order_by(ORDERINGS[ordering], "id")


def title_of(auction: Auction) -> str | None:
    """Título público: el de la publicación o el de la necesidad B2B (dato público)."""
    if auction.listing_id:
        from apps.catalog.models import Listing

        return Listing.objects.filter(pk=auction.listing_id).values_list("title", flat=True).first()
    if auction.procurement_request_id:
        from apps.catalog.models import ProcurementRequest

        return (
            ProcurementRequest.objects.filter(pk=auction.procurement_request_id).values_list("title", flat=True).first()
        )
    return None


def pseudonyms(auction_id) -> dict[str, int]:
    """`Postor N`: N = orden de la primera puja de cada postor en la subasta."""
    order: dict[str, int] = {}
    for bidder in Bid.objects.filter(auction_id=auction_id).order_by("seq").values_list("bidder_user_id", flat=True):
        order.setdefault(str(bidder), len(order) + 1)
    return order


def watchers_count(auction_id) -> int:
    with connection.cursor() as cursor:
        cursor.execute("SELECT count(*) FROM watchlist WHERE auction_id = %s", [auction_id])
        return cursor.fetchone()[0]


def is_watching(user, auction_id) -> bool:
    if user is None or not user.is_authenticated:
        return False
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT EXISTS (SELECT 1 FROM watchlist WHERE user_id = %s AND auction_id = %s)", [user.pk, auction_id]
        )
        return bool(cursor.fetchone()[0])


def reputation(user_id) -> tuple[str | None, int]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT round(avg(score)::numeric, 1), count(*) FROM rating WHERE ratee_user_id = %s", [user_id])
        avg, count = cursor.fetchone()
    return (None if avg is None else f"{avg}", count)
