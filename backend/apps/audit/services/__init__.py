"""Registro de auditoría de negocio.

`record()` se llama DENTRO de la transacción del cambio que audita: si la transacción falla,
no queda auditoría falsa (ADR-0002). Nunca incluir en `data` contraseñas, máximos proxy,
ofertas selladas no reveladas, reserva ni semillas.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction

from apps.audit.models import AuditEvent
from apps.core.context import current_request_id

# Catálogo cerrado (REGLAS-DE-SUBASTAS.md §12).
ACTIONS = frozenset(
    {
        "user_registered",
        "organization_created",
        "organization_updated",
        "organization_member_added",
        "organization_verified",
        "organization_rejected",
        "auction_created",
        "auction_draft_updated",
        "auction_published",
        "auction_text_corrected",
        "auction_cancelled",
        "auction_extended",
        "bid_accepted",
        "proxy_limit_set",
        "proxy_limit_raised",
        "sealed_offer_submitted",
        "sealed_offer_updated",
        "sealed_offer_withdrawn",
        "participant_registered",
        "participant_admitted",
        "participant_rejected",
        "supplier_offer_accepted",
        "auction_closed",
        "sealed_offers_revealed",
        "candle_revealed",
        "settlement_updated",
        "rating_submitted",
        "user_suspended",
        "user_reactivated",
        "user_role_changed",
        "report_created",
        "report_resolved",
        "organization_ownership_transferred",
        "organization_member_revoked",
        "category_changed",
        "security_password_changed",
        "security_sessions_revoked",
        "user_profile_updated",
        "admin_action",
    }
)


def record(
    action: str,
    *,
    actor_user_id,
    entity_type: str,
    entity_id=None,
    auction_id=None,
    data: dict[str, Any] | None = None,
) -> AuditEvent:
    if action not in ACTIONS:
        raise ValueError(f"Acción de auditoría desconocida: {action}")
    if not transaction.get_connection().in_atomic_block:
        raise RuntimeError("audit.record() debe ejecutarse dentro de la transacción del cambio auditado.")
    return AuditEvent.objects.create(
        action=action,
        actor_user_id=actor_user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        auction_id=auction_id,
        request_id=current_request_id(),
        data=data or {},
    )
