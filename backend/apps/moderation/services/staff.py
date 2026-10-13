"""Herramientas de staff: moderación (LX-77) y administración (LX-79).

ROLES-Y-PERMISOS.md §2, §4, §6, §7 y SEGURIDAD-Y-AUTORIZACION.md (T20):
- Toda acción exige motivo y se audita en la misma transacción.
- Staff no suspende a otro staff, salvo admin -> moderador. Nadie se suspende a sí mismo.
- Cambiar rol exige contraseña (step-up), protege al último admin y revoca las sesiones.
- Las vistas internas nunca muestran máximos proxy ni ofertas selladas sin revelar.
"""

from __future__ import annotations

import re
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import Q

from apps.accounts.models import User
from apps.accounts.sessions import revoke_all_sessions
from apps.auctions.domain import errors as domain_errors
from apps.auctions.domain.state import OPEN, Status
from apps.auctions.models import Auction, Bid, JobHeartbeat, ProxyBidLimit, SealedOffer
from apps.auctions.services.lifecycle import notify_cancelled
from apps.auctions.services.snapshot import evaluate
from apps.audit.models import AuditEvent
from apps.audit.services import record
from apps.catalog.models import Category, Listing
from apps.core.capabilities import AccountStatus, MembershipStatus, PlatformRole
from apps.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from apps.core.time import time_source
from apps.moderation.models import Report
from apps.organizations.models import Organization, OrganizationMembership

STAFF = (PlatformRole.MODERATOR, PlatformRole.ADMIN)
SLUG = re.compile(r"^[a-z0-9-]{2,60}$")


def _field(field: str, message: str) -> ValidationFailed:
    return ValidationFailed(details={"fields": {field: [message]}})


def _require_reason(reason: str, field: str = "reason") -> str:
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise _field(field, "El motivo es obligatorio.")
    return reason


def _ensure_staff(actor: User, *, admin: bool = False) -> None:
    allowed = (PlatformRole.ADMIN,) if admin else STAFF
    if actor.platform_role not in allowed or actor.status != AccountStatus.ACTIVE:
        raise Forbidden()


# --- Bandeja ------------------------------------------------------------------------------------


def summary() -> dict:
    now = time_source.db_now()
    return {
        "pending_organizations": Organization.objects.filter(verification_status="pending").count(),
        "open_reports": Report.objects.filter(status="open").count(),
        "active_auctions": Auction.objects.filter(
            status__in=(Status.SCHEDULED, Status.ACTIVE), starts_at__lte=now, ends_at__gt=now
        ).count(),
        "suspended_users": User.objects.filter(status=AccountStatus.SUSPENDED).count(),
    }


# --- Cancelación por moderador ---------------------------------------------------------------------


def cancel_auction(actor: User, auction_id, *, reason: str) -> Auction:
    """Cualquier estado salvo cerrado (persistido o ya vencido), con motivo (ROLES §4)."""
    _ensure_staff(actor)
    reason = _require_reason(reason)
    with transaction.atomic():
        auction = Auction.objects.select_for_update().filter(pk=auction_id).first()
        if auction is None:
            raise NotFound()
        now = time_source.db_now()
        effective = evaluate(auction, now).status
        if effective in (Status.CLOSED, Status.CANCELLED):
            raise domain_errors.invalid_transition(effective, "cancel")
        auction.status = Status.CANCELLED
        auction.cancelled_at = now
        auction.cancel_reason = reason
        auction.version += 1
        auction.save(update_fields=["status", "cancelled_at", "cancel_reason", "version"])
        record(
            "auction_cancelled",
            actor_user_id=actor.pk,
            entity_type="auction",
            entity_id=auction.pk,
            auction_id=auction.pk,
            data={"by": actor.platform_role, "from_status": effective},
        )
        notify_cancelled(auction, reason=reason)
    return auction


# --- Suspensión y efectos (ROLES §7) -----------------------------------------------------------------


def _can_act_on(actor: User, target: User) -> None:
    if str(actor.pk) == str(target.pk):
        raise Forbidden(message="No puedes aplicarte esta acción a ti mismo.")
    if target.platform_role == PlatformRole.ADMIN:
        raise Forbidden(message="Un admin no puede ser suspendido.")
    if target.platform_role == PlatformRole.MODERATOR and actor.platform_role != PlatformRole.ADMIN:
        raise Forbidden(message="Solo un admin suspende a un moderador.")


def suspend_user(actor: User, user_id, *, reason: str) -> User:
    _ensure_staff(actor)
    reason = _require_reason(reason)
    with transaction.atomic():
        target = User.objects.select_for_update().filter(pk=user_id).first()
        if target is None:
            raise NotFound()
        _can_act_on(actor, target)
        if target.status == AccountStatus.SUSPENDED:
            raise Conflict(code="INVALID_STATE_TRANSITION", message="La cuenta ya está suspendida.")
        now = time_source.db_now()
        target.status = AccountStatus.SUSPENDED
        target.status_reason = reason
        target.status_changed_at = now
        target.status_changed_by = actor.pk
        target.save(update_fields=["status", "status_reason", "status_changed_at", "status_changed_by"])
        effects = _apply_suspension_effects(target, now)
        record(
            "user_suspended",
            actor_user_id=actor.pk,
            entity_type="user",
            entity_id=target.pk,
            data={"reason": reason, **effects},
        )
    revoke_all_sessions(target.pk)
    return target


def _apply_suspension_effects(target: User, now) -> dict:
    # 1) Subastas propias draft/scheduled: se cancelan (las activas siguen; decide un moderador).
    cancelled = 0
    for auction in Auction.objects.select_for_update().filter(
        owner_user_id=target.pk, status__in=(Status.DRAFT, Status.SCHEDULED)
    ):
        if evaluate(auction, now).status not in (Status.DRAFT, Status.SCHEDULED):
            continue
        auction.status = Status.CANCELLED
        auction.cancelled_at = now
        auction.cancel_reason = "owner_suspended"
        auction.version += 1
        auction.save(update_fields=["status", "cancelled_at", "cancel_reason", "version"])
        record(
            "auction_cancelled",
            actor_user_id=None,
            entity_type="auction",
            entity_id=auction.pk,
            auction_id=auction.pk,
            data={"by": "system", "reason": "owner_suspended"},
        )
        notify_cancelled(auction, reason="owner_suspended")
        cancelled += 1
    # 2) Límites proxy activos: dejan de generar pujas automáticas.
    proxies = ProxyBidLimit.objects.filter(user_id=target.pk, status="active").update(status="cancelled")
    # 3) Ofertas selladas vigentes en subastas abiertas: se retiran (ajusta el contador público).
    withdrawn = 0
    current = SealedOffer.objects.filter(bidder_user_id=target.pk, is_current=True, status="submitted")
    for auction_id in set(current.values_list("auction_id", flat=True)):
        auction = Auction.objects.select_for_update().get(pk=auction_id)
        if auction.status not in OPEN:
            continue
        count = current.filter(auction_id=auction_id).update(is_current=False, status="withdrawn")
        auction.active_offer_count = max(0, auction.active_offer_count - count)
        auction.version += 1
        auction.save(update_fields=["active_offer_count", "version"])
        withdrawn += count
    # Las pujas ya hechas se mantienen (irrevocables) y las membresías también (sin sesión no actúa).
    return {"auctions_cancelled": cancelled, "proxy_limits_cancelled": proxies, "sealed_offers_withdrawn": withdrawn}


def reactivate_user(actor: User, user_id, *, reason: str) -> User:
    _ensure_staff(actor, admin=True)
    reason = _require_reason(reason)
    with transaction.atomic():
        target = User.objects.select_for_update().filter(pk=user_id).first()
        if target is None:
            raise NotFound()
        if target.status != AccountStatus.SUSPENDED:
            raise Conflict(code="INVALID_STATE_TRANSITION", message="La cuenta no está suspendida.")
        target.status = AccountStatus.ACTIVE
        target.status_reason = reason
        target.status_changed_at = time_source.db_now()
        target.status_changed_by = actor.pk
        target.save(update_fields=["status", "status_reason", "status_changed_at", "status_changed_by"])
        record(
            "user_reactivated", actor_user_id=actor.pk, entity_type="user", entity_id=target.pk, data={"reason": reason}
        )
    return target


def _has_open_activity(target: User) -> bool:
    open_auctions = Auction.objects.filter(status__in=OPEN)
    return (
        OrganizationMembership.objects.filter(user_id=target.pk, status=MembershipStatus.ACTIVE).exists()
        or open_auctions.filter(owner_user_id=target.pk).exists()
        or open_auctions.filter(leader_user_id=target.pk).exists()
        or ProxyBidLimit.objects.filter(user_id=target.pk, status="active").exists()
        or SealedOffer.objects.filter(bidder_user_id=target.pk, is_current=True, auction__status__in=OPEN).exists()
    )


def change_role(actor: User, user_id, *, platform_role: str, reason: str, password: str) -> User:
    """Step-up + último admin protegido + sin actividad comercial abierta para pasar a staff (ROLES §6)."""
    _ensure_staff(actor, admin=True)
    if not actor.check_password(password):
        raise Forbidden(code="STEP_UP_FAILED", message="La contraseña no es correcta.")
    if platform_role not in {r.value for r in PlatformRole}:
        raise _field("platform_role", "Rol no válido.")
    reason = _require_reason(reason)
    with transaction.atomic():
        target = User.objects.select_for_update().filter(pk=user_id).first()
        if target is None:
            raise NotFound()
        previous = target.platform_role
        if previous == platform_role:
            raise Conflict(code="INVALID_STATE_TRANSITION", message="El usuario ya tiene ese rol.")
        if previous == PlatformRole.ADMIN:
            admins = User.objects.select_for_update().filter(
                platform_role=PlatformRole.ADMIN, status=AccountStatus.ACTIVE
            )
            if admins.count() <= 1:
                raise Conflict(code="LAST_ADMIN", message="Debe quedar al menos un admin activo.")
        if platform_role in STAFF and previous == PlatformRole.USER and _has_open_activity(target):
            raise Conflict(
                code="OPEN_ACTIVITY",
                message="Cierra sus membresías y operaciones abiertas antes de pasarlo a staff.",
            )
        target.platform_role = platform_role
        target.save(update_fields=["platform_role"])
        record(
            "user_role_changed",
            actor_user_id=actor.pk,
            entity_type="user",
            entity_id=target.pk,
            data={"from": previous, "to": platform_role, "reason": reason},
        )
    revoke_all_sessions(target.pk)  # vuelve a iniciar sesión con sus nuevas capacidades
    return target


# --- Reportes ----------------------------------------------------------------------------------------


def reports(status: str | None):
    qs = Report.objects.select_related("reporter_user").order_by("created_at")
    return qs.filter(status=status) if status else qs


def resolve_report(actor: User, report_id, *, status: str, note: str, action: str = "none") -> Report:
    _ensure_staff(actor)
    note = _require_reason(note, "note")
    if status not in ("dismissed", "actioned"):
        raise _field("status", "Usa dismissed o actioned.")
    if (status == "actioned") != (action in ("cancel_auction", "suspend_user")):
        raise _field("action", "`actioned` requiere cancelar la subasta o suspender al usuario; `dismissed`, ninguna.")
    with transaction.atomic():
        report = Report.objects.select_for_update().filter(pk=report_id).first()
        if report is None:
            raise NotFound()
        if report.status != "open":
            raise Conflict(code="INVALID_STATE_TRANSITION", message="El reporte ya fue resuelto.")
        if action == "cancel_auction":
            if report.target_type != "auction":
                raise _field("action", "Solo aplica a reportes de subastas.")
            cancel_auction(actor, report.target_id, reason=note)
        elif action == "suspend_user":
            suspend_user(actor, _reported_user(report), reason=note)
        report.status = status
        report.resolution_note = note
        report.resolved_by_user_id = actor.pk
        report.resolved_at = time_source.db_now()
        report.save(update_fields=["status", "resolution_note", "resolved_by_user_id", "resolved_at"])
        record(
            "report_resolved",
            actor_user_id=actor.pk,
            entity_type="report",
            entity_id=report.pk,
            auction_id=report.target_id if report.target_type == "auction" else None,
            data={"status": status, "action": action},
        )
    return report


def _reported_user(report: Report):
    if report.target_type == "user":
        return report.target_id
    if report.target_type == "auction":
        return Auction.objects.values_list("owner_user_id", flat=True).get(pk=report.target_id)
    return Listing.objects.values_list("owner_user_id", flat=True).get(pk=report.target_id)


# --- Vistas internas -------------------------------------------------------------------------------------


def auction_internals(auction_id) -> dict:
    """Pujas con identidades y auditoría. Sin máximos proxy ni ofertas selladas sin revelar."""
    auction = Auction.objects.select_related("owner_user").filter(pk=auction_id).first()
    if auction is None:
        raise NotFound()
    bids = Bid.objects.filter(auction_id=auction.pk).select_related("bidder_user").order_by("seq")
    events = AuditEvent.objects.filter(auction_id=auction.pk).order_by("occurred_at")
    sealed_revealed = auction.mechanism == "sealed" and auction.status == Status.CLOSED
    return {"auction": auction, "bids": list(bids), "events": list(events), "sealed_revealed": sealed_revealed}


def user_file(user_id) -> dict:
    target = User.objects.filter(pk=user_id).first()
    if target is None:
        raise NotFound()
    return {
        "user": target,
        "auctions_owned": Auction.objects.filter(owner_user_id=target.pk).count(),
        "bids_placed": Bid.objects.filter(bidder_user_id=target.pk).count(),
        "reports_received": Report.objects.filter(target_type="user", target_id=target.pk).count(),
        "reports_made": Report.objects.filter(reporter_user_id=target.pk).count(),
        "recent_events": list(AuditEvent.objects.filter(actor_user_id=target.pk).order_by("-occurred_at")[:20]),
    }


# --- Administración (LX-79) ---------------------------------------------------------------------------------


def search_users(*, q: str = "", role: str = "", status: str = ""):
    qs = User.objects.order_by("created_at")
    if q:
        qs = qs.filter(Q(email__icontains=q.strip()[:100]) | Q(display_name__icontains=q.strip()[:100]))
    if role:
        qs = qs.filter(platform_role=role)
    if status:
        qs = qs.filter(status=status)
    return qs


def create_category(actor: User, *, name: str, slug: str) -> Category:
    _ensure_staff(actor, admin=True)
    if not SLUG.match(slug):
        raise _field("slug", "Minúsculas, números y guiones.")
    try:
        with transaction.atomic():
            category = Category.objects.create(name=name.strip(), slug=slug, is_active=True)
            record(
                "category_changed",
                actor_user_id=actor.pk,
                entity_type="category",
                entity_id=None,
                data={"action": "created", "category_id": category.pk, "slug": slug},
            )
    except IntegrityError:
        raise Conflict(code="SLUG_ALREADY_EXISTS", message="Ya existe una categoría con ese slug.") from None
    return category


def update_category(actor: User, category_id: int, **changes) -> Category:
    _ensure_staff(actor, admin=True)
    with transaction.atomic():
        category = Category.objects.select_for_update().filter(pk=category_id).first()
        if category is None:
            raise NotFound()
        for key in ("name", "is_active"):
            if key in changes:
                setattr(category, key, changes[key].strip() if key == "name" else changes[key])
        category.save(update_fields=[k for k in ("name", "is_active") if k in changes] or ["name"])
        record(
            "category_changed",
            actor_user_id=actor.pk,
            entity_type="category",
            entity_id=None,
            data={"action": "updated", "category_id": category.pk, "fields": sorted(changes)},
        )
    return category


def audit_events(*, auction_id=None, actor_id=None, action=None, date_from=None, date_to=None):
    qs = AuditEvent.objects.order_by("-occurred_at", "-id")
    if auction_id:
        qs = qs.filter(auction_id=auction_id)
    if actor_id:
        qs = qs.filter(actor_user_id=actor_id)
    if action:
        qs = qs.filter(action=action)
    if date_from:
        qs = qs.filter(occurred_at__gte=date_from)
    if date_to:
        qs = qs.filter(occurred_at__lte=date_to)
    return qs


def system_health() -> dict:
    now = time_source.db_now()
    heartbeats = [
        {
            "dev": h.dev,
            "job": h.job,
            "last_run_at": h.last_run_at,
            "last_closed_count": h.last_closed_count,
            "stale": now - h.last_run_at > timedelta(minutes=2),
        }
        for h in JobHeartbeat.objects.order_by("dev")
    ]
    return {
        "server_time": now,
        "close_jobs": heartbeats,
        "pending_closes": Auction.objects.filter(
            status__in=(Status.SCHEDULED, Status.ACTIVE), ends_at__lte=now
        ).count(),
        "counts": {
            "users": User.objects.count(),
            "open_auctions": Auction.objects.filter(status__in=OPEN).count(),
            "closed_auctions": Auction.objects.filter(status=Status.CLOSED).count(),
            "open_reports": Report.objects.filter(status="open").count(),
        },
    }
