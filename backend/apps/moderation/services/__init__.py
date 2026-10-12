"""Reportes de usuarios (LX-37, REGLAS-DE-SUBASTAS.md §14).

- Objeto reportable: subasta publicada, publicación con alguna subasta publicada, o usuario.
  Si no existe o no es visible para quien reporta: 404 (sin enumeración).
- Máximo 10 reportes por usuario en 24 h (hora de PostgreSQL) y uno por objeto.
"""

from __future__ import annotations

from datetime import timedelta

from django.db import IntegrityError, transaction

from apps.accounts.models import User
from apps.auctions.domain.state import Status
from apps.auctions.models import Auction
from apps.audit.services import record
from apps.core.capabilities import AccountStatus, PlatformRole
from apps.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from apps.core.time import time_source
from apps.moderation.models import Report, TargetType

MAX_REPORTS_PER_DAY = 10


def _target_exists(user: User, target_type: str, target_id) -> bool:
    if target_type == TargetType.AUCTION:
        return Auction.objects.visible_to(user).exclude(status=Status.DRAFT).filter(pk=target_id).exists()
    if target_type == TargetType.LISTING:
        return Auction.objects.exclude(status=Status.DRAFT).filter(listing_id=target_id).exists()
    if target_type == TargetType.USER:
        return User.objects.filter(pk=target_id).exists()
    return False


def create_report(user: User, *, target_type: str, target_id, reason: str, detail: str = "") -> Report:
    if user.platform_role != PlatformRole.USER or user.status != AccountStatus.ACTIVE:
        raise Forbidden()
    if target_type == TargetType.USER and str(target_id) == str(user.pk):
        raise ValidationFailed(details={"fields": {"target_id": ["No puedes reportarte a ti mismo."]}})
    if not _target_exists(user, target_type, target_id):
        raise NotFound()

    with transaction.atomic():
        User.objects.select_for_update().only("id").get(pk=user.pk)  # serializa el conteo diario
        since = time_source.db_now() - timedelta(days=1)
        if Report.objects.filter(reporter_user_id=user.pk, created_at__gte=since).count() >= MAX_REPORTS_PER_DAY:
            raise Conflict(
                code="LIMIT_REACHED",
                message="Alcanzaste el máximo de reportes por día.",
                details={"limit": MAX_REPORTS_PER_DAY},
            )
        try:
            with transaction.atomic():
                report = Report.objects.create(
                    reporter_user_id=user.pk,
                    target_type=target_type,
                    target_id=target_id,
                    reason=reason,
                    detail=detail,
                )
        except IntegrityError:
            raise Conflict(code="ALREADY_REPORTED", message="Ya reportaste este elemento.") from None
        record(
            "report_created",
            actor_user_id=user.pk,
            entity_type="report",
            entity_id=report.pk,
            auction_id=target_id if target_type == TargetType.AUCTION else None,
            data={"target_type": target_type, "reason": reason},
        )
    return report
