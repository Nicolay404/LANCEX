"""Pujas transaccionales: manual (`place_bid`) y máximo proxy (`set_proxy_limit`) (LX-22, LX-31, LX-32).

Esqueleto de ADR-0005 (decisión 3), común a ambos caminos:

    BEGIN (READ COMMITTED)
      1. SELECT ... FROM auction WHERE id = :id FOR UPDATE      -- serializa por subasta
      2. now := clock_timestamp()                              -- reloj de PostgreSQL
      3. idempotencia (puja manual)
      4. estado efectivo = active
      5. validaciones comunes (cuenta, dueño, ritmo 1/s)
      6-7. mecanismo (Strategy, con ProxyBidding si aplica): validar y aplicar
      8. INSERT bid(s) con seq = bid_count + k; límites agotados -> exhausted
      9. política de cierre: on_bid_accepted (soft close extiende ends_at, auditado)
     10. UPDATE auction (precio, líder, bid_count, ends_at, version + 1)
     11. INSERT audit_event + notificación `outbid` al líder desplazado
    COMMIT
Los máximos proxy nunca salen de esta transacción: ni en respuestas, ni en auditoría, ni en logs.
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
from apps.auctions.domain.state import BidIntent, BidOutcome, Status
from apps.auctions.models import Auction, Bid, ProxyBidLimit
from apps.audit.services import record
from apps.core.capabilities import AccountStatus, PlatformRole
from apps.core.errors import Conflict, Forbidden, LancexError, NotFound, RateLimited
from apps.core.time import time_source
from apps.notifications import services as notifications
from apps.organizations import services as organizations

from .snapshot import evaluate

logger = logging.getLogger("lancex.bids")

MIN_SECONDS_BETWEEN_BIDS = 1  # REGLAS §13: 1 puja manual por segundo por usuario y subasta


@dataclass(frozen=True, slots=True)
class PlaceBidResult:
    bid: Bid | None
    auction: Auction
    replayed: bool
    outbid_by_proxy: bool = False


# --- Entradas públicas -----------------------------------------------------------------------


def place_bid(user: User, auction_id, *, amount: Decimal, idempotency_key) -> PlaceBidResult:
    return _logged(auction_id, lambda: _place_bid(user, auction_id, amount, idempotency_key))


def set_proxy_limit(user: User, auction_id, *, max_amount: Decimal) -> PlaceBidResult:
    return _logged(auction_id, lambda: _set_proxy_limit(user, auction_id, max_amount))


def place_reverse_offer(
    user: User, auction_id, *, unit_price: Decimal, shipping_cost: Decimal, idempotency_key, organization_id=None
) -> PlaceBidResult:
    """Oferta a la baja de un proveedor admitido (REGLAS §7). El total lo calcula el servidor."""
    return _logged(
        auction_id,
        lambda: _place_reverse(user, auction_id, unit_price, shipping_cost, idempotency_key, organization_id),
    )


def own_proxy_limit(user, auction_id) -> ProxyBidLimit | None:
    """Solo el propio máximo (matriz de visibilidad): vivo, o el último si se agotó."""
    if user is None or not user.is_authenticated:
        return None
    mine = ProxyBidLimit.objects.filter(auction_id=auction_id, user_id=user.pk)
    return mine.filter(status="active").first() or mine.order_by("-updated_at").first()


def _logged(auction_id, operation) -> PlaceBidResult:
    try:
        return operation()
    except LancexError as exc:
        # Las pujas rechazadas no van a auditoría: log técnico con su código (REGLAS §12).
        logger.warning(
            "Puja rechazada", extra={"event": "bid_rejected", "error_code": exc.code, "auction_id": str(auction_id)}
        )
        raise


# --- Caminos ----------------------------------------------------------------------------------


def _place_bid(user: User, auction_id, amount: Decimal, idempotency_key) -> PlaceBidResult:
    _ensure_bidder(user)
    with transaction.atomic():
        auction, now = _lock(user, auction_id)

        previous = Bid.objects.filter(
            auction_id=auction.pk, bidder_user_id=user.pk, idempotency_key=idempotency_key
        ).first()
        if previous is not None:
            if previous.amount != amount:
                raise Conflict(code="IDEMPOTENCY_CONFLICT", message="La clave ya se usó con otro importe.")
            return PlaceBidResult(bid=previous, auction=auction, replayed=True)

        leader_limit = _leader_limit(auction)
        state = _active_state(auction, now, leader_limit)
        if str(user.pk) == state.owner_user_id:
            raise domain_errors.bid_on_own_auction()
        if Bid.objects.filter(
            auction_id=auction.pk,
            bidder_user_id=user.pk,
            source="manual",
            accepted_at__gt=now - timedelta(seconds=MIN_SECONDS_BETWEEN_BIDS),
        ).exists():
            raise RateLimited(details={"retry_after_s": MIN_SECONDS_BETWEEN_BIDS})

        outcome = registry.mechanism_for(state).apply_bid(state, BidIntent(str(user.pk), amount), now)
        bid = _commit_outcome(
            auction,
            state,
            outcome,
            now,
            challenger=user,
            idempotency_key=idempotency_key,
            limits=_limit_ids(leader_limit),
        )
    return _result(bid, auction, user)


def _set_proxy_limit(user: User, auction_id, max_amount: Decimal) -> PlaceBidResult:
    _ensure_bidder(user)
    with transaction.atomic():
        auction, now = _lock(user, auction_id)
        if not auction.proxy_enabled:
            raise Conflict(code="PROXY_NOT_ENABLED", message="Esta subasta no admite pujas automáticas.")
        leader_limit = _leader_limit(auction)
        state = _active_state(auction, now, leader_limit)

        own = (
            ProxyBidLimit.objects.select_for_update()
            .filter(auction_id=auction.pk, user_id=user.pk, status="active")
            .first()
        )
        mechanism = registry.mechanism_for(state)
        is_leader = mechanism.validate_new_limit(state, str(user.pk), max_amount, own.max_amount if own else None)

        if own is None:
            own = ProxyBidLimit.objects.create(auction=auction, user_id=user.pk, max_amount=max_amount)
            action = "proxy_limit_set"
        else:
            ProxyBidLimit.objects.filter(pk=own.pk).update(max_amount=max_amount)
            action = "proxy_limit_raised"
        # Auditoría SIN el importe: el máximo es privado (ADR-0002, matriz de visibilidad).
        record(action, actor_user_id=user.pk, entity_type="proxy_bid_limit", entity_id=own.pk, auction_id=auction.pk)

        if is_leader:  # subir el propio techo no genera pujas ni cambia nada visible
            return PlaceBidResult(bid=None, auction=auction, replayed=False)

        outcome = mechanism.apply_bid(state, BidIntent(str(user.pk), max_amount, is_proxy=True), now)
        limits = {**_limit_ids(leader_limit), str(user.pk): own.pk}
        bid = _commit_outcome(auction, state, outcome, now, challenger=user, idempotency_key=None, limits=limits)
    return _result(bid, auction, user)


def _place_reverse(user: User, auction_id, unit_price, shipping_cost, idempotency_key, organization_id):
    from . import participants

    _ensure_bidder(user)
    with transaction.atomic():
        auction, now = _lock(user, auction_id)
        if auction.mechanism != "reverse":
            raise Conflict(code="MECHANISM_MISMATCH", message="Esta subasta no es inversa.")

        previous = Bid.objects.filter(
            auction_id=auction.pk, bidder_user_id=user.pk, idempotency_key=idempotency_key
        ).first()
        if previous is not None:
            if (previous.unit_price, previous.shipping_cost) != (unit_price, shipping_cost):
                raise Conflict(code="IDEMPOTENCY_CONFLICT", message="La clave ya se usó con otra oferta.")
            return PlaceBidResult(bid=previous, auction=auction, replayed=True)

        state = _active_state(auction, now, None)
        # ROLES §5: un miembro de la compradora no oferta en su propia subasta.
        if organizations.active_membership(user, auction.organization_id):
            raise domain_errors.bid_on_own_auction()
        organization = participants.admitted_organization_for(user, auction, organization_id)
        if Bid.objects.filter(
            auction_id=auction.pk,
            bidder_user_id=user.pk,
            accepted_at__gt=now - timedelta(seconds=MIN_SECONDS_BETWEEN_BIDS),
        ).exists():
            raise RateLimited(details={"retry_after_s": MIN_SECONDS_BETWEEN_BIDS})

        mechanism = registry.mechanism_for(state)
        total = mechanism.total_for(state, unit_price, shipping_cost)
        intent = BidIntent(
            str(user.pk), total, organization_id=organization, unit_price=unit_price, shipping_cost=shipping_cost
        )
        outcome = mechanism.apply_bid(state, intent, now)
        bid = _commit_outcome(auction, state, outcome, now, challenger=user, idempotency_key=idempotency_key, limits={})
    return _result(bid, auction, user)


# --- Motor común ------------------------------------------------------------------------------


def _ensure_bidder(user: User) -> None:
    if user.platform_role != PlatformRole.USER or user.status != AccountStatus.ACTIVE or not user.is_active:
        raise Forbidden()


def _lock(user: User, auction_id) -> tuple[Auction, object]:
    auction = Auction.objects.visible_to(user).select_for_update().filter(pk=auction_id).first()
    if auction is None:
        raise NotFound()
    return auction, time_source.db_now()  # hora oficial, después del bloqueo


def _leader_limit(auction: Auction) -> ProxyBidLimit | None:
    if not auction.proxy_enabled or auction.leader_user_id is None:
        return None
    return (
        ProxyBidLimit.objects.select_for_update()
        .filter(auction_id=auction.pk, user_id=auction.leader_user_id, status="active")
        .first()
    )


def _limit_ids(leader_limit: ProxyBidLimit | None) -> dict:
    return {str(leader_limit.user_id): leader_limit.pk} if leader_limit else {}


def _active_state(auction: Auction, now, leader_limit: ProxyBidLimit | None):
    effective = evaluate(auction, now, leader_proxy_max=leader_limit.max_amount if leader_limit else None)
    if effective.status != Status.ACTIVE:
        raise domain_errors.auction_not_active(effective.status)
    return effective.state


def _commit_outcome(auction, state, outcome: BidOutcome, now, *, challenger, idempotency_key, limits) -> Bid:
    previous_leader = str(auction.leader_user_id) if auction.leader_user_id else None
    previous_org = str(auction.leader_organization_id) if auction.leader_organization_id else None

    created: list[Bid] = []
    for k, new_bid in enumerate(outcome.bids, start=1):
        is_challenger_manual = new_bid.bidder_user_id == str(challenger.pk) and new_bid.source == "manual"
        created.append(
            Bid.objects.create(
                auction=auction,
                seq=auction.bid_count + k,
                bidder_user_id=new_bid.bidder_user_id,
                amount=new_bid.amount,
                source=new_bid.source,
                proxy_limit_id=limits.get(new_bid.bidder_user_id) if new_bid.source == "proxy" else None,
                idempotency_key=idempotency_key if is_challenger_manual else None,
                organization_id=new_bid.organization_id,
                unit_price=new_bid.unit_price,
                shipping_cost=new_bid.shipping_cost,
            )
        )
    if outcome.exhausted_proxy_user_ids:
        ProxyBidLimit.objects.filter(
            auction_id=auction.pk, user_id__in=outcome.exhausted_proxy_user_ids, status="active"
        ).update(status="exhausted")

    extended = registry.closing_policy_for(state).on_bid_accepted(state, now)
    old_end = auction.ends_at
    auction.current_price = outcome.current_price
    auction.leader_user_id = outcome.leader_user_id
    auction.leader_organization_id = outcome.leader_organization_id
    auction.bid_count += len(created)
    auction.ends_at = extended.ends_at
    auction.version += 1
    auction.save(
        update_fields=["current_price", "leader_user_id", "leader_organization_id", "bid_count", "ends_at", "version"]
    )

    for bid in created:
        record(
            "bid_accepted",
            actor_user_id=bid.bidder_user_id,
            entity_type="bid",
            entity_id=bid.pk,
            auction_id=auction.pk,
            data={"seq": bid.seq, "amount": f"{bid.amount:.2f}", "source": bid.source},
        )
    if extended.ends_at != old_end:
        record(
            "auction_extended",
            actor_user_id=None,
            entity_type="auction",
            entity_id=auction.pk,
            auction_id=auction.pk,
            data={"from": old_end.isoformat(), "to": extended.ends_at.isoformat()},
        )
    # En la inversa compite la organización: avisar si cambió la organización líder.
    leader_changed = (
        previous_org != outcome.leader_organization_id
        if outcome.leader_organization_id is not None
        else previous_leader != str(outcome.leader_user_id)
    )
    if previous_leader and leader_changed:
        notifications.notify(
            [previous_leader],
            "outbid",
            auction_id=auction.pk,
            data={"current_price": f"{outcome.current_price:.2f}"},
        )
    return next(b for b in reversed(created) if b.bidder_user_id == str(challenger.pk))


def _result(bid: Bid, auction: Auction, user: User) -> PlaceBidResult:
    bid.refresh_from_db(fields=["accepted_at"])
    outbid = auction.leader_user_id is not None and str(auction.leader_user_id) != str(user.pk)
    return PlaceBidResult(bid=bid, auction=auction, replayed=False, outbid_by_proxy=outbid)
