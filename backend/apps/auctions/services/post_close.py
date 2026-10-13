"""Después del cierre: liquidación y calificaciones (LX-71, REGLAS-DE-SUBASTAS.md §10).

- Solo con `outcome = awarded`. LANCEX no procesa pagos ni envíos: el dueño registra el resultado.
- `settlement_status`: `pending` → `completed` | `failed` (final; con comentario).
- Con la liquidación final, dueño y ganador se califican una vez (1–5, comentario ≤ 300).
"""

from __future__ import annotations

from django.db import IntegrityError, transaction

from apps.auctions.models import Auction, Rating
from apps.audit.services import record
from apps.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from apps.notifications import services as notifications

from .lifecycle import _ensure_commercial_user, _owned_for_update

FINAL_SETTLEMENT = ("completed", "failed")


def update_settlement(user, auction_id, *, settlement_status: str, settlement_note: str = "") -> Auction:
    _ensure_commercial_user(user)
    if settlement_status not in FINAL_SETTLEMENT:
        raise ValidationFailed(details={"fields": {"settlement_status": ["Usa completed o failed."]}})
    if settlement_status == "failed" and len(settlement_note.strip()) < 3:
        raise ValidationFailed(details={"fields": {"settlement_note": ["Explica por qué falló."]}})
    with transaction.atomic():
        auction = _owned_for_update(user, auction_id)
        if auction.outcome != "awarded":
            raise Conflict(code="INVALID_STATE_TRANSITION", message="Solo subastas adjudicadas.")
        if auction.settlement_status != "pending":
            raise Conflict(
                code="INVALID_STATE_TRANSITION",
                message="La liquidación ya es final.",
                details={"settlement_status": auction.settlement_status},
            )
        auction.settlement_status = settlement_status
        auction.settlement_note = settlement_note.strip() or None
        auction.save(update_fields=["settlement_status", "settlement_note"])
        record(
            "settlement_updated",
            actor_user_id=user.pk,
            entity_type="auction",
            entity_id=auction.pk,
            auction_id=auction.pk,
            data={"settlement_status": settlement_status},
        )
    return auction


def rate(user, auction_id, *, score: int, comment: str = "") -> Rating:
    _ensure_commercial_user(user)
    if not 1 <= score <= 5:
        raise ValidationFailed(details={"fields": {"score": ["Entre 1 y 5."]}})
    with transaction.atomic():
        auction = Auction.objects.select_for_update().filter(pk=auction_id, status="closed").first()
        if auction is None:
            raise NotFound()
        owner, winner = str(auction.owner_user_id), str(auction.winner_user_id or "")
        if str(user.pk) not in (owner, winner) or not winner:
            raise Forbidden()
        if auction.settlement_status not in FINAL_SETTLEMENT:
            raise Conflict(code="INVALID_STATE_TRANSITION", message="Primero se registra la liquidación.")
        ratee = winner if str(user.pk) == owner else owner
        try:
            with transaction.atomic():
                rating = Rating.objects.create(
                    auction=auction, rater_user_id=user.pk, ratee_user_id=ratee, score=score, comment=comment.strip()
                )
        except IntegrityError:
            raise Conflict(code="ALREADY_RATED", message="Ya calificaste esta subasta.") from None
        record(
            "rating_submitted",
            actor_user_id=user.pk,
            entity_type="rating",
            entity_id=rating.pk,
            auction_id=auction.pk,
            data={"score": score},
        )
        notifications.notify([ratee], "rating_received", auction_id=auction.pk)
    return rating
