"""`place_bid`: puja manual transaccional (LX-22, ADR-0005 decisión 3).

BEGIN (READ COMMITTED)
  1. SELECT ... FROM auction WHERE id = :id FOR UPDATE      -- serializa por subasta
  2. now := clock_timestamp()                              -- reloj de PostgreSQL
  3. reintento con la misma Idempotency-Key -> misma respuesta (200)
  4. estado efectivo = active
  5. validaciones comunes (cuenta, dueño, ritmo 1/s)
  6-7. mecanismo: validar y aplicar
  8. INSERT bid(s) con seq = bid_count + k
  9. política de cierre: on_bid_accepted
 10. UPDATE auction (precio, líder, bid_count, ends_at, version + 1)
 11. INSERT audit_event
COMMIT
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal

from django.db import transaction

from apps.accounts.models import User
from apps.auctions.domain import errors as domain_errors
from apps.auctions.domain import registry
from apps.auctions.domain.state import BidIntent, Status
from apps.auctions.models import Auction, Bid
from apps.audit.services import record
from apps.core.capabilities import AccountStatus, PlatformRole
from apps.core.errors import Conflict, Forbidden, LancexError, NotFound, RateLimited
from apps.core.time import time_source

from .snapshot import evaluate

logger = logging.getLogger("lancex.bids")

MIN_SECONDS_BETWEEN_BIDS = 1  # REGLAS §13: 1 puja manual por segundo por usuario y subasta


@dataclass(frozen=True, slots=True)
class PlaceBidResult:
    bid: Bid
    auction: Auction
    replayed: bool
    outbid_by_proxy: bool = False


def place_bid(user: User, auction_id, *, amount: Decimal, idempotency_key) -> PlaceBidResult:
    try:
        return _place_bid(user, auction_id, amount=amount, idempotency_key=idempotency_key)
    except LancexError as exc:
        # Las pujas rechazadas no van a auditoría: log técnico con su código (REGLAS §12).
        logger.warning(
            "Puja rechazada", extra={"event": "bid_rejected", "error_code": exc.code, "auction_id": str(auction_id)}
        )
        raise


def _place_bid(user: User, auction_id, *, amount: Decimal, idempotency_key) -> PlaceBidResult:
    if user.platform_role != PlatformRole.USER or user.status != AccountStatus.ACTIVE or not user.is_active:
        raise Forbidden()

    with transaction.atomic():
        # 1. Bloqueo de la fila: dos pujas a la misma subasta se ejecutan una tras otra.
        auction = Auction.objects.visible_to(user).select_for_update().filter(pk=auction_id).first()
        if auction is None:
            raise NotFound()
        # 2. Hora oficial, tomada después del bloqueo.
        now = time_source.db_now()

        # 3. Idempotencia: reintento lógico de la misma puja.
        previous = Bid.objects.filter(
            auction_id=auction.pk, bidder_user_id=user.pk, idempotency_key=idempotency_key
        ).first()
        if previous is not None:
            if previous.amount != amount:
                raise Conflict(code="IDEMPOTENCY_CONFLICT", message="La clave ya se usó con otro importe.")
            return PlaceBidResult(bid=previous, auction=auction, replayed=True)

        # 4. Ventana de pujas según la hora de PostgreSQL.
        effective = evaluate(auction, now)
        if effective.status != Status.ACTIVE:
            raise domain_errors.auction_not_active(effective.status)
        state = effective.state

        # 5. Validaciones comunes.
        if str(user.pk) == state.owner_user_id:
            raise domain_errors.bid_on_own_auction()
        recent = Bid.objects.filter(
            auction_id=auction.pk,
            bidder_user_id=user.pk,
            source="manual",
            accepted_at__gt=now - timedelta(seconds=MIN_SECONDS_BETWEEN_BIDS),
        ).exists()
        if recent:
            raise RateLimited(details={"retry_after_s": MIN_SECONDS_BETWEEN_BIDS})

        # 6-7. Mecanismo (Strategy).
        intent = BidIntent(bidder_user_id=str(user.pk), amount=amount)
        outcome = registry.mechanism_for(state).apply_bid(state, intent, now)

        # 8. Libro de pujas: el orden oficial es seq.
        created: list[Bid] = []
        for k, new_bid in enumerate(outcome.bids, start=1):
            created.append(
                Bid.objects.create(
                    auction=auction,
                    seq=auction.bid_count + k,
                    bidder_user_id=new_bid.bidder_user_id,
                    amount=new_bid.amount,
                    source=new_bid.source,
                    idempotency_key=idempotency_key if new_bid.source == "manual" else None,
                )
            )
        manual = next(b for b in created if b.source == "manual")

        # 9. Política de cierre (p. ej., soft close extiende ends_at en la Fase 3).
        accepted = registry.closing_policy_for(state).on_bid_accepted(state, now)

        # 10. Copia desnormalizada en la misma transacción.
        auction.current_price = outcome.current_price
        auction.leader_user_id = outcome.leader_user_id
        auction.bid_count += len(created)
        auction.ends_at = accepted.ends_at
        auction.version += 1
        auction.save(update_fields=["current_price", "leader_user_id", "bid_count", "ends_at", "version"])

        # 11. Auditoría.
        for bid in created:
            record(
                "bid_accepted",
                actor_user_id=bid.bidder_user_id,
                entity_type="bid",
                entity_id=bid.pk,
                auction_id=auction.pk,
                data={"seq": bid.seq, "amount": f"{bid.amount:.2f}", "source": bid.source},
            )

    manual.refresh_from_db(fields=["accepted_at"])
    outbid = auction.leader_user_id is not None and str(auction.leader_user_id) != str(user.pk)
    return PlaceBidResult(bid=manual, auction=auction, replayed=False, outbid_by_proxy=outbid)
