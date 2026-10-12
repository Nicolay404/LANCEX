"""Notificaciones internas y seguimiento de subastas (LX-33, REGLAS-DE-SUBASTAS.md §11).

- Se crean en la MISMA transacción del evento que las causa (o en el job de cierre).
- `data` solo lleva datos públicos: nunca máximos proxy ni importes sellados no revelados.
- Se leen por polling (`GET /notifications/`).
"""

from __future__ import annotations

from collections.abc import Iterable

from django.db import IntegrityError, transaction

from apps.auctions.domain.state import Status
from apps.auctions.models import Auction
from apps.core.errors import NotFound
from apps.core.models import ClockTimestamp
from apps.notifications.models import Notification, Watchlist

TYPES = frozenset(
    {
        "outbid",
        "auction_won",
        "auction_lost",
        "auction_closed_owner",
        "auction_unsold_owner",
        "auction_cancelled",
        "participant_admitted",
        "participant_rejected",
        "watch_auction_started",
        "watch_auction_ending",
        "rating_received",
    }
)
# Claves permitidas en `data` (lista blanca: nada privado llega a una notificación).
DATA_KEYS = frozenset({"title", "current_price", "final_price", "outcome", "ends_at", "reason"})


def notify(user_ids: Iterable, notification_type: str, *, auction_id=None, data: dict | None = None) -> int:
    if notification_type not in TYPES:
        raise ValueError(f"Tipo de notificación desconocido: {notification_type}")
    payload = {k: v for k, v in (data or {}).items() if k in DATA_KEYS}
    unique = list(dict.fromkeys(str(u) for u in user_ids if u))
    Notification.objects.bulk_create(
        [Notification(user_id=u, type=notification_type, auction_id=auction_id, data=payload) for u in unique]
    )
    return len(unique)


def watchers_of(auction_id) -> list[str]:
    return [str(u) for u in Watchlist.objects.filter(auction_id=auction_id).values_list("user_id", flat=True)]


def watch(user, auction_id) -> None:
    auction = Auction.objects.visible_to(user).exclude(status=Status.DRAFT).filter(pk=auction_id).first()
    if auction is None:
        raise NotFound()
    try:
        with transaction.atomic():
            Watchlist.objects.create(user_id=user.pk, auction_id=auction.pk)
    except IntegrityError:
        pass  # ya la seguía: idempotente


def unwatch(user, auction_id) -> None:
    Watchlist.objects.filter(user_id=user.pk, auction_id=auction_id).delete()


def list_for(user, *, unread_only: bool = False):
    qs = Notification.objects.visible_to(user).order_by("-created_at", "-id")
    return qs.filter(read_at__isnull=True) if unread_only else qs


def mark_read(user, *, ids: list[int] | None = None, mark_all: bool = False) -> int:
    qs = Notification.objects.visible_to(user).filter(read_at__isnull=True)
    if not mark_all:
        qs = qs.filter(pk__in=ids or [])
    return qs.update(read_at=ClockTimestamp())
