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

from django.conf import settings
from django.db import transaction

from apps.auctions.domain import registry
from apps.auctions.domain.state import BidRecord, Status
from apps.auctions.models import Auction, Bid, JobHeartbeat
from apps.audit.services import record
from apps.core.time import time_source

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
        records = [
            BidRecord(seq=b.seq, bidder_user_id=str(b.bidder_user_id), amount=b.amount, counted=b.counted)
            for b in Bid.objects.filter(auction_id=auction.pk).only("seq", "bidder_user_id", "amount", "counted")
        ]
        valid = [r for r in records if policy.bid_counts_for_result(state, r)]
        result = registry.mechanism_for(state).select_winner(state, valid)

        auction.status = Status.CLOSED
        auction.outcome = result.outcome
        auction.winner_user_id = result.winner_user_id
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
                "final_price": None if result.final_price is None else f"{result.final_price:.2f}",
                "bid_count": auction.bid_count,
            },
        )
        auction_pk = str(auction.pk)
        transaction.on_commit(
            lambda: logger.info("Subasta cerrada", extra={"event": "auction_closed", "auction_id": auction_pk})
        )
    return CloseResult(closed=True, auction=auction)


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
    _heartbeat(closed)
    return closed


def _heartbeat(closed: int) -> None:
    dev = (getattr(settings, "DEV_NAME", "") or "unknown")[:40]
    JobHeartbeat.objects.update_or_create(
        dev=dev, defaults={"job": JOB_NAME, "last_run_at": time_source.db_now(), "last_closed_count": closed}
    )
    if closed:
        logger.info("Ciclo de cierre", extra={"event": "close_job_run", "status": closed})
