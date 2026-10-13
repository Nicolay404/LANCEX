"""Cierre idempotente de subastas (LX-23, ADR-0005 decisión 4).

- `close_auction(id)`: materializa el resultado una sola vez. Si ya está cerrada, no hace nada.
- `close_due_auctions()`: barre las subastas vencidas con `FOR UPDATE SKIP LOCKED`, así los tres
  backends locales pueden ejecutarlo a la vez sin bloquearse ni duplicar resultados.

La corrección no depende del job: el estado efectivo se calcula en cada lectura y las pujas tardías
se rechazan siempre. El job solo materializa ganador, auditoría y (Fase 3) notificaciones.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import connection, transaction

from apps.auctions.domain import registry
from apps.auctions.domain.state import BidRecord, Status
from apps.auctions.models import Auction, Bid, JobHeartbeat, SealedOffer
from apps.audit.services import record
from apps.core.time import time_source
from apps.notifications import services as notifications

from . import participants
from .snapshot import evaluate

logger = logging.getLogger("lancex.closing")

BATCH_SIZE = 50
JOB_NAME = "close_due_auctions"


@dataclass(frozen=True, slots=True)
class CloseResult:
    closed: bool  # True solo si ESTA llamada materializó el cierre
    auction: Auction | None


def close_auction(auction_id, *, skip_locked: bool = False) -> CloseResult:
    with transaction.atomic():
        qs = Auction.objects.select_for_update(skip_locked=skip_locked).filter(pk=auction_id)
        auction = qs.first()
        if auction is None:  # no existe, o la está cerrando otro backend (skip_locked)
            return CloseResult(closed=False, auction=None)
        if auction.status in (Status.CLOSED, Status.CANCELLED, Status.DRAFT):
            return CloseResult(closed=False, auction=auction)

        now = time_source.db_now()
        effective = evaluate(auction, now)
        if effective.status != Status.CLOSED:
            return CloseResult(closed=False, auction=auction)  # aún no vence

        state = effective.state
        policy = registry.closing_policy_for(state)
        records = _result_records(auction)
        valid = [r for r in records if policy.bid_counts_for_result(state, r)]
        result = registry.mechanism_for(state).select_winner(state, valid)
        if auction.mechanism == "sealed":
            _reveal_sealed_offers(auction, now)

        auction.status = Status.CLOSED
        auction.outcome = result.outcome
        auction.winner_user_id = result.winner_user_id
        auction.winner_organization_id = result.winner_organization_id
        auction.final_price = result.final_price
        auction.closed_at = now
        if result.outcome == "awarded":
            auction.settlement_status = "pending"
        auction.version += 1
        auction.save(
            update_fields=[
                "status",
                "outcome",
                "winner_user_id",
                "winner_organization_id",
                "final_price",
                "closed_at",
                "settlement_status",
                "version",
            ]
        )
        record(
            "auction_closed",
            actor_user_id=None,  # sistema
            entity_type="auction",
            entity_id=auction.pk,
            auction_id=auction.pk,
            data={
                "outcome": result.outcome,
                "winner_user_id": result.winner_user_id,
                "winner_organization_id": result.winner_organization_id,
                "final_price": None if result.final_price is None else f"{result.final_price:.2f}",
                "bid_count": auction.bid_count,
            },
        )
        _notify_closed(auction, records)
        auction_pk = str(auction.pk)
        transaction.on_commit(
            lambda: logger.info("Subasta cerrada", extra={"event": "auction_closed", "auction_id": auction_pk})
        )
    return CloseResult(closed=True, auction=auction)


def _result_records(auction: Auction) -> list[BidRecord]:
    """Libro que decide el resultado: pujas aceptadas u ofertas selladas vigentes."""
    if auction.mechanism == "sealed":
        offers = SealedOffer.objects.filter(auction_id=auction.pk, is_current=True, status="submitted")
        return [BidRecord(seq=o.seq, bidder_user_id=str(o.bidder_user_id), amount=o.amount) for o in offers]
    return [
        BidRecord(
            seq=b.seq,
            bidder_user_id=str(b.bidder_user_id),
            amount=b.amount,
            counted=b.counted,
            organization_id=str(b.organization_id) if b.organization_id else None,
        )
        for b in Bid.objects.filter(auction_id=auction.pk).only(
            "seq", "bidder_user_id", "amount", "counted", "organization_id"
        )
    ]


def _reveal_sealed_offers(auction: Auction, now) -> None:
    """Revelación automática al cierre (REGLAS §6): no la dispara el dueño."""
    revealed = SealedOffer.objects.filter(auction_id=auction.pk, revealed_at__isnull=True).update(revealed_at=now)
    record(
        "sealed_offers_revealed",
        actor_user_id=None,
        entity_type="auction",
        entity_id=auction.pk,
        auction_id=auction.pk,
        data={"offers": revealed, "participants": auction.active_offer_count},
    )


def _notify_closed(auction: Auction, records: list[BidRecord]) -> None:
    """REGLAS §11: ganador, perdedores y dueño, en la misma transacción del cierre."""
    winner = str(auction.winner_user_id) if auction.winner_user_id else None
    final = None if auction.final_price is None else f"{auction.final_price:.2f}"
    data = {"outcome": auction.outcome, "final_price": final}
    bidders = {r.bidder_user_id for r in records}
    if winner:
        notifications.notify([winner], "auction_won", auction_id=auction.pk, data=data)
    notifications.notify(bidders - {winner}, "auction_lost", auction_id=auction.pk, data=data)
    owner_type = "auction_closed_owner" if auction.outcome == "awarded" else "auction_unsold_owner"
    notifications.notify([auction.owner_user_id], owner_type, auction_id=auction.pk, data=data)


def due_auction_ids(limit: int = BATCH_SIZE) -> list:
    """Candidatas: publicadas y vencidas según PostgreSQL (cierre fijo: ends_at)."""
    now = time_source.db_now()
    return list(
        Auction.objects.filter(status__in=(Status.SCHEDULED, Status.ACTIVE), ends_at__lte=now)
        .order_by("ends_at")
        .values_list("id", flat=True)[:limit]
    )


def close_due_auctions(limit: int = BATCH_SIZE) -> int:
    closed = sum(close_auction(auction_id, skip_locked=True).closed for auction_id in due_auction_ids(limit))
    notify_watchers()
    participants.freeze_unreviewed()
    _heartbeat(closed)
    return closed


WATCH_ENDING_BEFORE = timedelta(minutes=10)  # REGLAS §11: solo subastas `fixed`


def notify_watchers() -> int:
    """`watch_auction_started` y `watch_auction_ending`, una sola vez por seguidor y subasta.

    El `INSERT ... WHERE NOT EXISTS` es atómico por fila: si los tres backends corren el job a la vez,
    alguna notificación podría duplicarse en una carrera exacta; es un aviso informativo, no un resultado.
    """
    now = time_source.db_now()
    sent = 0
    with connection.cursor() as cursor:
        for notification_type, condition, params in (
            ("watch_auction_started", "a.starts_at <= %s AND a.ends_at > %s", [now, now]),
            (
                "watch_auction_ending",
                "a.closing_policy = 'fixed' AND a.ends_at > %s AND a.ends_at <= %s",
                [now, now + WATCH_ENDING_BEFORE],
            ),
        ):
            cursor.execute(
                f"""
                INSERT INTO notification (user_id, type, auction_id, data)
                SELECT w.user_id, %s, a.id, '{{}}'::jsonb
                  FROM watchlist w JOIN auction a ON a.id = w.auction_id
                 WHERE a.status IN ('scheduled', 'active') AND {condition}
                   AND NOT EXISTS (SELECT 1 FROM notification n
                                    WHERE n.user_id = w.user_id AND n.auction_id = a.id AND n.type = %s)
                """,  # noqa: S608 - condition es un literal de esta función; los valores van parametrizados
                [notification_type, *params, notification_type],
            )
            sent += cursor.rowcount
    return sent


def _heartbeat(closed: int) -> None:
    dev = (getattr(settings, "DEV_NAME", "") or "unknown")[:40]
    JobHeartbeat.objects.update_or_create(
        dev=dev, defaults={"job": JOB_NAME, "last_run_at": time_source.db_now(), "last_closed_count": closed}
    )
    if closed:
        logger.info("Ciclo de cierre", extra={"event": "close_job_run", "status": closed})
