"""Ofertas de sobre cerrado (LX-40, REGLAS-DE-SUBASTAS.md §6).

Mismo esqueleto transaccional que las pujas (ADR-0005): `FOR UPDATE` de la subasta, hora de
PostgreSQL tras el bloqueo, idempotencia por `Idempotency-Key`, `seq` del contador de la subasta.

Privacidad (matriz de visibilidad, T06/T07):
- Los importes nunca salen antes del cierre: ni en respuestas ajenas, ni en auditoría, ni en logs.
- `version` (y por tanto el ETag de `live/`) solo cambia cuando cambia el número público de
  participantes con oferta vigente: editar una oferta no deja rastro observable para terceros.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal

from django.db import transaction

from apps.accounts.models import User
from apps.auctions.domain import errors as domain_errors
from apps.auctions.domain import registry
from apps.auctions.domain.state import Status
from apps.auctions.models import Auction, SealedOffer
from apps.audit.services import record
from apps.core.capabilities import AccountStatus, PlatformRole
from apps.core.errors import Conflict, Forbidden, LancexError, NotFound
from apps.core.time import time_source

from .snapshot import evaluate

logger = logging.getLogger("lancex.bids")


@dataclass(frozen=True, slots=True)
class OfferResult:
    offer: SealedOffer
    replayed: bool


def own_offer(user, auction_id) -> SealedOffer | None:
    if user is None or not user.is_authenticated:
        return None
    return SealedOffer.objects.filter(auction_id=auction_id, bidder_user_id=user.pk, is_current=True).first()


def submit_offer(user: User, auction_id, *, amount: Decimal, idempotency_key) -> OfferResult:
    return _logged(auction_id, lambda: _submit(user, auction_id, amount, idempotency_key))


def withdraw_offer(user: User, auction_id) -> None:
    _logged(auction_id, lambda: _withdraw(user, auction_id))


def _logged(auction_id, operation):
    try:
        return operation()
    except LancexError as exc:
        # Solo el código: nunca el importe de una oferta sellada (ADR-0002).
        logger.warning(
            "Oferta sellada rechazada",
            extra={"event": "sealed_offer_rejected", "error_code": exc.code, "auction_id": str(auction_id)},
        )
        raise


def _lock_active_sealed(user: User, auction_id):
    if user.platform_role != PlatformRole.USER or user.status != AccountStatus.ACTIVE or not user.is_active:
        raise Forbidden()
    auction = Auction.objects.visible_to(user).select_for_update().filter(pk=auction_id).first()
    if auction is None:
        raise NotFound()
    now = time_source.db_now()
    if auction.mechanism != "sealed":
        raise Conflict(code="MECHANISM_MISMATCH", message="Esta subasta no es de sobre cerrado.")
    effective = evaluate(auction, now)
    if effective.status != Status.ACTIVE:
        raise domain_errors.auction_not_active(effective.status)
    return auction, effective.state


def _submit(user: User, auction_id, amount: Decimal, idempotency_key) -> OfferResult:
    with transaction.atomic():
        auction, state = _lock_active_sealed(user, auction_id)

        previous = SealedOffer.objects.filter(
            auction_id=auction.pk, bidder_user_id=user.pk, idempotency_key=idempotency_key
        ).first()
        if previous is not None:
            if previous.amount != amount:
                raise Conflict(code="IDEMPOTENCY_CONFLICT", message="La clave ya se usó con otro importe.")
            return OfferResult(offer=previous, replayed=True)

        registry.mechanism_for(state).validate_offer(state, str(user.pk), amount)

        current = (
            SealedOffer.objects.select_for_update()
            .filter(auction_id=auction.pk, bidder_user_id=user.pk, is_current=True)
            .first()
        )
        if current is not None:  # la versión anterior se conserva, sin vigencia (pierde prioridad)
            SealedOffer.objects.filter(pk=current.pk).update(is_current=False)

        auction.bid_count += 1  # contador interno de seq; nunca se publica en sellado
        offer = SealedOffer.objects.create(
            auction=auction,
            bidder_user_id=user.pk,
            amount=amount,
            seq=auction.bid_count,
            idempotency_key=idempotency_key,
        )
        fields = ["bid_count"]
        if current is None:
            auction.active_offer_count += 1
            auction.version += 1
            fields += ["active_offer_count", "version"]
        auction.save(update_fields=fields)

        record(
            "sealed_offer_updated" if current else "sealed_offer_submitted",
            actor_user_id=user.pk,
            entity_type="sealed_offer",
            entity_id=offer.pk,
            auction_id=auction.pk,
        )
    offer.refresh_from_db(fields=["submitted_at"])
    return OfferResult(offer=offer, replayed=False)


def _withdraw(user: User, auction_id) -> None:
    with transaction.atomic():
        auction, _ = _lock_active_sealed(user, auction_id)
        current = (
            SealedOffer.objects.select_for_update()
            .filter(auction_id=auction.pk, bidder_user_id=user.pk, is_current=True)
            .first()
        )
        if current is None:
            raise NotFound()
        SealedOffer.objects.filter(pk=current.pk).update(is_current=False, status="withdrawn")
        auction.active_offer_count -= 1
        auction.version += 1
        auction.save(update_fields=["active_offer_count", "version"])
        record(
            "sealed_offer_withdrawn",
            actor_user_id=user.pk,
            entity_type="sealed_offer",
            entity_id=current.pk,
            auction_id=auction.pk,
        )
