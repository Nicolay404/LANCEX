"""Vistas personales del usuario: `/panel`, `/mis-pujas` y su registro de actividad
(PANTALLAS-Y-NAVEGACION.md §3).

Solo datos PROPIOS: mis pujas, mi máximo proxy, mi oferta sellada, mis subastas, mis acciones.
Nada ajeno sale de aquí (matriz de visibilidad).

Sobre "saldo": LANCEX no procesa pagos ni custodia dinero (REGLAS §10, VISION-Y-ALCANCE). El resumen
de operaciones es INFORMATIVO: totales de subastas adjudicadas como comprador y como vendedor.
"""

from __future__ import annotations

from decimal import Decimal

from django.db.models import Count, Q, Sum

from apps.auctions.domain.state import Status
from apps.auctions.models import Auction, Bid, ProxyBidLimit, SealedOffer
from apps.audit.models import AuditEvent
from apps.core.time import time_source
from apps.notifications.models import Notification
from apps.organizations import services as organizations

from .snapshot import evaluate

TABS = ("active", "won", "lost")

# Registro de actividad: por acción, solo estas claves de `data` (lista blanca).
ACTIVITY_DATA_KEYS = {
    "bid_accepted": ("seq", "amount", "source"),
    "auction_created": ("mechanism", "closing_policy"),
    "auction_draft_updated": ("fields",),
    "auction_published": ("starts_at", "ends_at"),
    "auction_text_corrected": ("fields",),
    "auction_cancelled": ("from_status",),
    "settlement_updated": ("settlement_status",),
    "rating_submitted": ("score",),
    "report_created": ("target_type", "reason"),
    "organization_created": ("is_buyer", "is_supplier"),
    "organization_updated": ("fields", "back_to_pending"),
    "participant_registered": (),
    "sealed_offer_submitted": (),
    "sealed_offer_updated": (),
    "sealed_offer_withdrawn": (),
    "proxy_limit_set": (),
    "proxy_limit_raised": (),
    "security_password_changed": (),
    "user_registered": (),
}


def _my_auctions_filter(user) -> Q:
    """Subastas donde participé: pujas (también las de mis organizaciones en la inversa) u ofertas
    selladas. Subconsultas: un solo viaje a la base en vez de traer los ids primero."""
    return Q(pk__in=Bid.objects.filter(bidder_user_id=user.pk).values("auction_id")) | Q(
        pk__in=SealedOffer.objects.filter(bidder_user_id=user.pk).values("auction_id")
    )


def participations(user, tab: str, *, now=None) -> list[dict]:
    if tab not in TABS:
        tab = "active"
    now = now or time_source.db_now()
    my_orgs = organizations.member_organization_ids(user)
    auctions = (
        Auction.objects.filter(_my_auctions_filter(user))
        .select_related("listing__category", "procurement_request")
        .order_by("ends_at")
    )
    my_limits = {
        str(p.auction_id): p.max_amount
        for p in ProxyBidLimit.objects.filter(user_id=user.pk, status="active", auction__in=auctions)
    }
    my_offers = {
        str(o.auction_id): o.amount
        for o in SealedOffer.objects.filter(
            bidder_user_id=user.pk, is_current=True, status="submitted", auction__in=auctions
        )
    }
    my_last_bid = {}
    for b in Bid.objects.filter(bidder_user_id=user.pk, auction__in=auctions).order_by("seq"):
        my_last_bid[str(b.auction_id)] = b.amount

    items = []
    for a in auctions:
        ev = evaluate(a, now)
        key = str(a.pk)
        leading = (
            str(a.leader_organization_id) in my_orgs
            if a.mechanism == "reverse" and a.leader_organization_id
            else str(a.leader_user_id) == str(user.pk)
        )
        if a.status == Status.CANCELLED:
            my_status, group = "cancelled", "lost"
        elif a.status == Status.CLOSED:
            won = str(a.winner_user_id) == str(user.pk)
            my_status, group = ("won", "won") if won else ("lost", "lost")
        elif ev.result_pending:
            my_status, group = "pending_result", "active"
        elif a.mechanism == "sealed":
            my_status, group = ("offer_submitted" if key in my_offers else "offer_withdrawn"), "active"
        else:
            my_status, group = ("leading" if leading else "outbid"), "active"
        if group != tab:
            continue
        sealed_open = a.mechanism == "sealed" and a.status != Status.CLOSED
        items.append(
            {
                "auction_id": key,
                "title": a.listing.title
                if a.listing
                else (a.procurement_request.title if a.procurement_request else None),
                "mechanism": a.mechanism,
                "closing_policy": a.closing_policy,
                "status": ev.status,
                "ends_at": a.ends_at,
                "my_status": my_status,
                # Precio público: en sellado abierto no existe (matriz de visibilidad).
                "current_price": None
                if sealed_open
                else _str(a.final_price if a.status == Status.CLOSED else a.current_price),
                "my_last_bid": _str(my_last_bid.get(key)),
                "my_proxy_max": _str(my_limits.get(key)),  # PROPIO
                "my_sealed_offer": _str(my_offers.get(key)),  # PROPIA
            }
        )
    return items


def summary(user) -> dict:
    """`/panel`: resumen personal + resumen informativo de operaciones (no es un saldo)."""
    now = time_source.db_now()
    active = participations(user, "active", now=now)
    totals = _owner_and_buyer_totals(user)
    return {
        "server_time": now,
        "participations": {
            "leading": sum(1 for i in active if i["my_status"] == "leading"),
            "outbid": sum(1 for i in active if i["my_status"] == "outbid"),
            "sealed_offers": sum(1 for i in active if i["my_status"] == "offer_submitted"),
            "won": totals["won"],
        },
        "my_auctions": {
            "draft": totals["draft"],
            "scheduled_or_active": totals["scheduled_or_active"],
            "sold": totals["sold"],
            "unsold": totals["unsold"],
        },
        "unread_notifications": Notification.objects.filter(user_id=user.pk, read_at__isnull=True).count(),
        "operations": {
            "notice": "Resumen informativo: LANCEX no procesa pagos ni guarda saldos.",
            "bought_total": _str(totals["bought_total"] or Decimal("0")),
            "sold_total": _str(totals["sold_total"] or Decimal("0")),
            "settled_as_buyer": _str(totals["settled_as_buyer"] or Decimal("0")),
            "settled_as_seller": _str(totals["settled_as_seller"] or Decimal("0")),
            "pending_settlements": totals["pending_settlements"],
        },
    }


def _owner_and_buyer_totals(user) -> dict:
    """Todos los contadores y totales del panel en UNA consulta (agregación condicional)."""
    mine = Q(owner_user_id=user.pk)
    won = Q(winner_user_id=user.pk, outcome="awarded")
    sold = mine & Q(outcome="awarded")
    completed = Q(settlement_status="completed")
    return Auction.objects.filter(mine | Q(winner_user_id=user.pk)).aggregate(
        draft=Count("pk", filter=mine & Q(status=Status.DRAFT)),
        scheduled_or_active=Count("pk", filter=mine & Q(status__in=(Status.SCHEDULED, Status.ACTIVE))),
        sold=Count("pk", filter=sold),
        unsold=Count("pk", filter=mine & Q(outcome="unsold")),
        won=Count("pk", filter=won),
        pending_settlements=Count("pk", filter=(sold | won) & Q(settlement_status="pending")),
        bought_total=Sum("final_price", filter=won),
        sold_total=Sum("final_price", filter=sold),
        settled_as_buyer=Sum("final_price", filter=won & completed),
        settled_as_seller=Sum("final_price", filter=sold & completed),
    )


def activity(user):
    """Mis acciones auditadas, más recientes primero."""
    return AuditEvent.objects.filter(Q(actor_user_id=user.pk)).order_by("-occurred_at", "-id")


def activity_row(event, titles: dict) -> dict:
    allowed = ACTIVITY_DATA_KEYS.get(event.action, ())
    return {
        "id": event.pk,
        "occurred_at": event.occurred_at,
        "action": event.action,
        "entity_type": event.entity_type,
        "auction_id": str(event.auction_id) if event.auction_id else None,
        "auction_title": titles.get(str(event.auction_id)) if event.auction_id else None,
        "details": {k: event.data.get(k) for k in allowed if k in (event.data or {})},
    }


def auction_titles(auction_ids) -> dict[str, str]:
    rows = Auction.objects.filter(pk__in=[a for a in auction_ids if a]).select_related("listing", "procurement_request")
    return {
        str(a.pk): (a.listing.title if a.listing else (a.procurement_request.title if a.procurement_request else None))
        for a in rows
    }


def _str(value) -> str | None:
    return None if value is None else f"{value:.2f}"
