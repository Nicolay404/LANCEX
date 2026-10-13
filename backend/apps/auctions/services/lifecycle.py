"""Ciclo de vida de una subasta: borrador, edición, publicación y cancelación (LX-21, REGLAS §1 y §9).

Cada caso de uso revalida dueño, capacidad y estado (ADR-0006) y audita en la misma transacción.
"""

from __future__ import annotations

from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import F

from apps.accounts.models import User
from apps.auctions.domain import errors as domain_errors
from apps.auctions.domain import registry
from apps.auctions.domain.closing.soft_close import SoftClose
from apps.auctions.domain.money import to_str
from apps.auctions.domain.state import OPEN, AuctionConfig, Status
from apps.auctions.models import Auction, Bid
from apps.audit.services import record
from apps.catalog.models import Listing
from apps.core.capabilities import AccountStatus, PlatformRole
from apps.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from apps.core.time import time_source
from apps.notifications import services as notifications
from apps.organizations import services as organizations
from apps.organizations.models import Organization

from .snapshot import evaluate

MAX_OPEN_AUCTIONS_PER_USER = 10  # REGLAS §13
RULE_FIELDS = (
    "mechanism",
    "closing_policy",
    "proxy_enabled",
    "starting_price",
    "min_increment",
    "reserve_price",
    "starts_at",
    "ends_at",
    "soft_close_window_s",
    "soft_close_extension_s",
    "soft_close_max_total_s",
    "reference_budget",
    "min_decrement",
)
TEXT_FIELDS = ("title", "description")  # se corrigen en la publicación mientras está `scheduled`


def _ensure_commercial_user(user: User) -> None:
    if user.platform_role != PlatformRole.USER or user.status != AccountStatus.ACTIVE or not user.is_active:
        raise Forbidden()


def _owned_for_update(user: User, auction_id) -> Auction:
    """Dueño, o miembro activo de la organización dueña (ROLES-Y-PERMISOS.md §4)."""
    auction = Auction.objects.visible_to(user).select_for_update().filter(pk=auction_id).first()
    if auction is None:
        raise NotFound()
    if auction.owner_user_id == user.pk:
        return auction
    if auction.organization_id and organizations.active_membership(user, auction.organization_id):
        return auction
    raise Forbidden()


def _config_from(data: dict[str, Any], base: AuctionConfig | None = None) -> AuctionConfig:
    # Además de las reglas, se conservan los datos derivados de la necesidad B2B (no editables aquí).
    values = {f: getattr(base, f) for f in (*RULE_FIELDS, "quantity", "buyer_organization_id")} if base else {}
    values.update({k: v for k, v in data.items() if k in RULE_FIELDS})
    values.setdefault("proxy_enabled", False)
    if values.get("closing_policy") == "soft_close":
        SoftClose.with_defaults(values)
    elif "closing_policy" in data:  # al cambiar a otra política se limpian sus parámetros
        for field in registry.SOFT_CLOSE_FIELDS:
            values[field] = None
    return AuctionConfig(**values)


MAX_OPEN_AUCTIONS_PER_ORGANIZATION = 10  # REGLAS §13


def create_draft(user: User, *, listing_id=None, organization_id=None, procurement_request_id=None, **data):
    _ensure_commercial_user(user)
    config = _config_from(data)
    registry.validate_config(config)
    if config.mechanism == "reverse":
        return _create_reverse_draft(user, config, organization_id, procurement_request_id)
    if organization_id or procurement_request_id:
        raise ValidationFailed(details={"fields": {"organization_id": ["Solo aplica a la subasta inversa."]}})
    if listing_id is None:
        raise ValidationFailed(details={"fields": {"listing_id": ["Es obligatorio."]}})

    listing = Listing.objects.visible_to(user).filter(pk=listing_id).first()
    if listing is None:
        raise ValidationFailed(details={"fields": {"listing_id": ["La publicación no existe o no es tuya."]}})

    with transaction.atomic():
        User.objects.select_for_update().only("id").get(pk=user.pk)
        open_count = Auction.objects.filter(owner_user_id=user.pk, status__in=OPEN).count()
        if open_count >= MAX_OPEN_AUCTIONS_PER_USER:
            raise Conflict(
                code="LIMIT_REACHED",
                message="Alcanzaste el máximo de subastas abiertas.",
                details={"limit": MAX_OPEN_AUCTIONS_PER_USER},
            )
        try:
            with transaction.atomic():
                auction = Auction.objects.create(
                    owner_user_id=user.pk,
                    listing=listing,
                    **{f: getattr(config, f) for f in RULE_FIELDS},
                )
        except IntegrityError:
            # Índice único parcial: una publicación con una sola subasta abierta.
            raise Conflict(
                code="LISTING_HAS_OPEN_AUCTION", message="La publicación ya tiene una subasta abierta."
            ) from None
        record(
            "auction_created",
            actor_user_id=user.pk,
            entity_type="auction",
            entity_id=auction.pk,
            auction_id=auction.pk,
            data={"mechanism": config.mechanism, "closing_policy": config.closing_policy},
        )
    return auction


def _create_reverse_draft(user: User, config: AuctionConfig, organization_id, procurement_request_id) -> Auction:
    """Inversa B2B: la crea un miembro de una compradora verificada sobre una necesidad de esa organización."""
    from apps.accounts.principal import load_principal
    from apps.catalog.models import ProcurementRequest
    from apps.core.capabilities import OrgCap, compute

    if organization_id is None or procurement_request_id is None:
        raise ValidationFailed(
            details={"fields": {"procurement_request_id": ["La inversa necesita organización y necesidad B2B."]}}
        )
    if not compute(load_principal(user)).has_in_organization(OrgCap.AUCTION_CREATE_REVERSE, organization_id):
        raise Forbidden(code="ORGANIZATION_NOT_VERIFIED", message="La organización no puede crear subastas inversas.")
    need = ProcurementRequest.objects.filter(pk=procurement_request_id, buyer_organization_id=organization_id).first()
    if need is None:
        raise ValidationFailed(details={"fields": {"procurement_request_id": ["No pertenece a la organización."]}})

    with transaction.atomic():
        Organization.objects.select_for_update().only("id").get(pk=organization_id)
        open_count = Auction.objects.filter(organization_id=organization_id, status__in=OPEN).count()
        if open_count >= MAX_OPEN_AUCTIONS_PER_ORGANIZATION:
            raise Conflict(
                code="LIMIT_REACHED",
                message="La organización alcanzó el máximo de subastas abiertas.",
                details={"limit": MAX_OPEN_AUCTIONS_PER_ORGANIZATION},
            )
        try:
            with transaction.atomic():
                auction = Auction.objects.create(
                    owner_user_id=user.pk,
                    organization_id=organization_id,
                    procurement_request_id=need.pk,
                    **{f: getattr(config, f) for f in RULE_FIELDS},
                )
        except IntegrityError:
            raise Conflict(
                code="PROCUREMENT_HAS_AUCTION", message="La necesidad ya tiene una subasta asociada."
            ) from None
        record(
            "auction_created",
            actor_user_id=user.pk,
            entity_type="auction",
            entity_id=auction.pk,
            auction_id=auction.pk,
            data={
                "mechanism": "reverse",
                "closing_policy": config.closing_policy,
                "organization_id": str(organization_id),
            },
        )
    return auction


def update_auction(user: User, auction_id, **changes) -> Auction:
    """`draft`: reglas editables. `scheduled`: solo título/descripción (auditado). Otro: RULES_LOCKED."""
    _ensure_commercial_user(user)
    rules = {k: v for k, v in changes.items() if k in RULE_FIELDS}
    texts = {k: v for k, v in changes.items() if k in TEXT_FIELDS}

    with transaction.atomic():
        auction = _owned_for_update(user, auction_id)
        if auction.status == Status.DRAFT:
            if texts:
                Listing.objects.filter(pk=auction.listing_id).update(**texts)
            if rules:
                config = _config_from(rules, evaluate(auction, time_source.db_now()).state.config)
                registry.validate_config(config)
                for field in RULE_FIELDS:
                    setattr(auction, field, getattr(config, field))
                auction.save(update_fields=list(RULE_FIELDS))
            record(
                "auction_draft_updated",
                actor_user_id=user.pk,
                entity_type="auction",
                entity_id=auction.pk,
                auction_id=auction.pk,
                data={"fields": sorted(changes)},
            )
        elif auction.status == Status.SCHEDULED and not rules:
            Listing.objects.filter(pk=auction.listing_id).update(**texts)
            Auction.objects.filter(pk=auction.pk).update(version=F("version") + 1)
            record(
                "auction_text_corrected",
                actor_user_id=user.pk,
                entity_type="auction",
                entity_id=auction.pk,
                auction_id=auction.pk,
                data={"fields": sorted(texts)},
            )
        else:
            raise domain_errors.rules_locked()
    return Auction.objects.get(pk=auction_id)


def publish(user: User, auction_id) -> Auction:
    """`draft → scheduled`: congela `rules_snapshot` (RULES_LOCKED desde aquí)."""
    _ensure_commercial_user(user)
    with transaction.atomic():
        auction = _owned_for_update(user, auction_id)
        if auction.status != Status.DRAFT:
            raise domain_errors.invalid_transition(auction.status, "publish")
        now = time_source.db_now()
        # REGLAS §1: si starts_at ya pasó, se ajusta a la hora de publicación.
        if auction.starts_at is None or auction.starts_at < now:
            auction.starts_at = now
        config = _config_from({}, evaluate(auction, now).state.config)
        registry.validate_config(config)

        auction.status = Status.SCHEDULED
        auction.original_ends_at = auction.ends_at
        auction.published_at = now
        auction.rules_snapshot = {
            "mechanism": config.mechanism,
            "closing_policy": config.closing_policy,
            "proxy_enabled": config.proxy_enabled,
            "starting_price": to_str(config.starting_price),
            "min_increment": to_str(config.min_increment),
            "has_reserve": config.reserve_price is not None,  # el importe de la reserva no se copia
            "starts_at": config.starts_at.isoformat(),
            "ends_at": config.ends_at.isoformat(),
            "soft_close_window_s": config.soft_close_window_s,
            "soft_close_extension_s": config.soft_close_extension_s,
            "soft_close_max_total_s": config.soft_close_max_total_s,
            "reference_budget": to_str(config.reference_budget),
            "min_decrement": to_str(config.min_decrement),
            "quantity": None if config.quantity is None else f"{config.quantity:.3f}",
        }
        auction.version += 1
        auction.save(
            update_fields=["status", "starts_at", "original_ends_at", "published_at", "rules_snapshot", "version"]
        )
        record(
            "auction_published",
            actor_user_id=user.pk,
            entity_type="auction",
            entity_id=auction.pk,
            auction_id=auction.pk,
            data={"starts_at": config.starts_at.isoformat(), "ends_at": config.ends_at.isoformat()},
        )
    return auction


def cancel_by_owner(user: User, auction_id, *, reason: str) -> Auction:
    """Dueño: `draft`/`scheduled` siempre; `active` solo sin pujas (REGLAS §9)."""
    _ensure_commercial_user(user)
    with transaction.atomic():
        auction = _owned_for_update(user, auction_id)
        now = time_source.db_now()
        effective = evaluate(auction, now).status
        # En sellado `bid_count` es el contador interno de versiones (incluye retiradas): cuenta lo vigente.
        has_participation = auction.active_offer_count > 0 if auction.mechanism == "sealed" else auction.bid_count > 0
        allowed = effective in (Status.DRAFT, Status.SCHEDULED) or (
            effective == Status.ACTIVE and not has_participation
        )
        if not allowed:
            raise domain_errors.invalid_transition(effective, "cancel")
        auction.status = Status.CANCELLED
        auction.cancelled_at = now
        auction.cancel_reason = reason
        auction.version += 1
        auction.save(update_fields=["status", "cancelled_at", "cancel_reason", "version"])
        record(
            "auction_cancelled",
            actor_user_id=user.pk,
            entity_type="auction",
            entity_id=auction.pk,
            auction_id=auction.pk,
            data={"by": "owner", "from_status": effective},
        )
        notify_cancelled(auction, reason=reason)
    return auction


def notify_cancelled(auction: Auction, *, reason: str) -> None:
    """Participantes y seguidores (REGLAS §9). Se llama dentro de la transacción de la cancelación."""
    bidders = Bid.objects.filter(auction_id=auction.pk).values_list("bidder_user_id", flat=True).distinct()
    recipients = {str(u) for u in bidders} | set(notifications.watchers_of(auction.pk))
    recipients.discard(str(auction.owner_user_id))
    notifications.notify(recipients, "auction_cancelled", auction_id=auction.pk, data={"reason": reason})
