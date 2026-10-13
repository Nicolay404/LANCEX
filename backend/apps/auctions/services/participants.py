"""Inscripción y calificación de proveedores en la subasta inversa (LX-51, REGLAS-DE-SUBASTAS.md §7 y §15).

Fases: inscripción y calificación mientras la subasta está programada (antes de `starts_at`).
En `starts_at` la calificación se congela: las inscripciones sin revisar quedan `rejected`
con motivo `not_reviewed` (el estado efectivo se calcula al leer y el job lo materializa).
"""

from __future__ import annotations

from django.db import IntegrityError, connection, transaction

from apps.accounts.models import User
from apps.accounts.principal import load_principal
from apps.auctions.domain import errors as domain_errors
from apps.auctions.domain.state import Status
from apps.auctions.models import Auction, AuctionParticipant
from apps.audit.services import record
from apps.core.capabilities import AccountStatus, OrgCap, PlatformRole, compute
from apps.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from apps.core.time import time_source
from apps.notifications import services as notifications
from apps.organizations import services as organizations

from .queries import title_of
from .snapshot import evaluate

NOT_REVIEWED = "not_reviewed"


def _field(field: str, message: str) -> ValidationFailed:
    return ValidationFailed(details={"fields": {field: [message]}})


def conflict_of_interest() -> Forbidden:
    return Forbidden(code="CONFLICT_OF_INTEREST", message="Participación prohibida por conflicto de interés.")


def effective_participant_status(participant: AuctionParticipant, auction: Auction, now) -> str:
    if participant.status == "registered" and auction.starts_at is not None and now >= auction.starts_at:
        return "rejected"  # congelada en starts_at sin revisión
    return participant.status


def _reverse_auction(user, auction_id, *, for_update: bool = False) -> Auction:
    qs = Auction.objects.visible_to(user).select_related("procurement_request")
    if for_update:
        qs = qs.select_for_update(of=("self",))
    auction = qs.filter(pk=auction_id).first()
    if auction is None:
        raise NotFound()
    if auction.mechanism != "reverse":
        raise Conflict(code="MECHANISM_MISMATCH", message="Esta subasta no es inversa.")
    return auction


def _ensure_registration_open(auction: Auction, action: str):
    now = time_source.db_now()
    status = evaluate(auction, now).status
    if status != Status.SCHEDULED:
        raise domain_errors.invalid_transition(status, action)
    return now


def _clean_compliance(auction: Auction, compliance) -> list[dict]:
    required = {r["code"] for r in (auction.procurement_request.mandatory_requirements or [])}
    if not isinstance(compliance, list):
        raise _field("compliance", "Debe ser una lista.")
    by_code: dict[str, dict] = {}
    for item in compliance:
        code = str(item.get("code", ""))
        if code not in required or code in by_code:
            raise _field("compliance", f"Requisito desconocido o repetido: {code}.")
        by_code[code] = {
            "code": code,
            "complies": bool(item.get("complies")),
            "comment": str(item.get("comment", ""))[:300],
        }
    if set(by_code) != required:
        raise _field("compliance", "Declara el cumplimiento de cada requisito obligatorio.")
    return [by_code[c] for c in sorted(by_code)]


def register(user: User, auction_id, *, organization_id, compliance) -> AuctionParticipant:
    if user.platform_role != PlatformRole.USER or user.status != AccountStatus.ACTIVE:
        raise Forbidden()
    if not compute(load_principal(user)).has_in_organization(OrgCap.REVERSE_REGISTER, organization_id):
        raise Forbidden(
            code="ORGANIZATION_NOT_VERIFIED", message="La organización no puede inscribirse como proveedora."
        )
    with transaction.atomic():
        auction = _reverse_auction(user, auction_id, for_update=True)
        _ensure_registration_open(auction, "register")
        # REGLAS §15: ni la propia compradora ni un miembro de ella pueden inscribir proveedores.
        if str(organization_id) == str(auction.organization_id):
            raise conflict_of_interest()
        if organizations.active_membership(user, auction.organization_id):
            raise conflict_of_interest()
        cleaned = _clean_compliance(auction, compliance)
        try:
            with transaction.atomic():
                participant = AuctionParticipant.objects.create(
                    auction=auction, organization_id=organization_id, registered_by_user_id=user.pk, compliance=cleaned
                )
        except IntegrityError:
            raise Conflict(code="ALREADY_REGISTERED", message="La organización ya está inscrita.") from None
        record(
            "participant_registered",
            actor_user_id=user.pk,
            entity_type="auction_participant",
            entity_id=participant.pk,
            auction_id=auction.pk,
            data={"organization_id": str(organization_id)},
        )
    return participant


def decide(user: User, auction_id, participant_id, *, status: str, reason: str = "") -> AuctionParticipant:
    if status not in ("admitted", "rejected"):
        raise _field("status", "Usa admitted o rejected.")
    if status == "rejected" and len(reason.strip()) < 3:
        raise _field("reason", "El rechazo requiere un motivo.")
    with transaction.atomic():
        auction = _reverse_auction(user, auction_id, for_update=True)
        # Solo miembros activos de la organización compradora (participants.decide).
        if not organizations.active_membership(user, auction.organization_id):
            raise Forbidden()
        now = _ensure_registration_open(auction, "decide")
        participant = (
            AuctionParticipant.objects.select_for_update().filter(pk=participant_id, auction_id=auction.pk).first()
        )
        if participant is None:
            raise NotFound()
        participant.status = status
        participant.decision_reason = reason.strip() or None
        participant.decided_by_user_id = user.pk
        participant.decided_at = now
        participant.save(update_fields=["status", "decision_reason", "decided_by_user_id", "decided_at"])
        record(
            f"participant_{status}",
            actor_user_id=user.pk,
            entity_type="auction_participant",
            entity_id=participant.pk,
            auction_id=auction.pk,
            data={"organization_id": str(participant.organization_id)},
        )
        notifications.notify(
            [participant.registered_by_user_id],
            f"participant_{status}",
            auction_id=auction.pk,
            data={
                "title": title_of(auction),
                **({"reason": participant.decision_reason} if status == "rejected" else {}),
            },
        )
    return participant


def visible_participants(user, auction_id) -> tuple[Auction, list[AuctionParticipant], bool]:
    """Compradora: todas las inscripciones. Proveedor: solo las de sus organizaciones."""
    auction = _reverse_auction(user, auction_id)
    qs = (
        AuctionParticipant.objects.filter(auction_id=auction.pk)
        .select_related("organization")
        .order_by("registered_at")
    )
    is_buyer = organizations.active_membership(user, auction.organization_id) is not None
    if not is_buyer:
        qs = qs.filter(organization_id__in=organizations.member_organization_ids(user))
    return auction, list(qs), is_buyer


def registrations_of_organization(user, organization_id) -> list[AuctionParticipant]:
    """`/org/:orgId/inscripciones`: inscripciones de MI organización proveedora (solo miembros)."""
    if organizations.active_membership(user, organization_id) is None:
        raise NotFound()
    return list(
        AuctionParticipant.objects.filter(organization_id=organization_id)
        .select_related("auction__procurement_request", "organization")
        .order_by("-registered_at")
    )


def admitted_organization_for(user, auction: Auction, organization_id=None) -> str:
    """Organización proveedora ADMITIDA en nombre de la cual puja el usuario (`NOT_ADMITTED` si ninguna)."""
    mine = organizations.member_organization_ids(user)
    admitted = {
        str(o)
        for o in AuctionParticipant.objects.filter(
            auction_id=auction.pk, status="admitted", organization_id__in=mine
        ).values_list("organization_id", flat=True)
    }
    if organization_id is not None:
        if str(organization_id) not in admitted:
            raise Forbidden(code="NOT_ADMITTED", message="Tu organización no está admitida en esta subasta.")
        return str(organization_id)
    if not admitted:
        raise Forbidden(code="NOT_ADMITTED", message="Tu organización no está admitida en esta subasta.")
    if len(admitted) > 1:
        raise _field("organization_id", "Perteneces a varias organizaciones admitidas: indica cuál.")
    return admitted.pop()


def admitted_count(auction: Auction) -> int:
    return AuctionParticipant.objects.filter(auction_id=auction.pk, status="admitted").count()


def freeze_unreviewed() -> int:
    """Materializa `rejected (not_reviewed)` en las inversas que ya empezaron. Idempotente."""
    now = time_source.db_now()
    with connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE auction_participant p
               SET status = 'rejected', decision_reason = %s, decided_at = %s
              FROM auction a
             WHERE p.auction_id = a.id AND p.status = 'registered'
               AND a.mechanism = 'reverse' AND a.starts_at <= %s
               AND a.status IN ('scheduled', 'active', 'closed')
            """,
            [NOT_REVIEWED, now, now],
        )
        return cursor.rowcount
