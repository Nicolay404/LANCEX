"""Necesidades B2B (`procurement_request`, REGLAS-DE-SUBASTAS.md §7).

Solo una organización compradora VERIFICADA, por medio de un miembro activo, publica necesidades.
El detalle es público (los proveedores lo leen para decidir si se inscriben).
"""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import transaction

from apps.accounts.models import User
from apps.catalog.models import ProcurementRequest
from apps.core.capabilities import OrgCap, compute
from apps.core.errors import NotFound, ValidationFailed
from apps.core.time import time_source

MAX_REQUIREMENTS = 20
CODE = re.compile(r"^[A-Za-z0-9_-]{1,10}$")


def _field(field: str, message: str) -> ValidationFailed:
    return ValidationFailed(details={"fields": {field: [message]}})


def _clean_requirements(items) -> list[dict]:
    if not isinstance(items, list) or len(items) > MAX_REQUIREMENTS:
        raise _field("mandatory_requirements", f"Lista de 0 a {MAX_REQUIREMENTS} requisitos.")
    cleaned, seen = [], set()
    for item in items:
        code = str(item.get("code", "")).strip()
        description = str(item.get("description", "")).strip()
        if not CODE.match(code) or not 3 <= len(description) <= 300:
            raise _field("mandatory_requirements", "Cada requisito necesita `code` corto y `description`.")
        if code in seen:
            raise _field("mandatory_requirements", f"Código repetido: {code}.")
        seen.add(code)
        cleaned.append({"code": code, "description": description})
    return cleaned


def create_request(user: User, *, organization_id, **data) -> ProcurementRequest:
    from apps.accounts.principal import load_principal

    # Revalida la capacidad contextual en ESTA organización (verificada + compradora + miembro activo).
    if not compute(load_principal(user)).has_in_organization(OrgCap.PROCUREMENT_MANAGE, organization_id):
        raise NotFound()
    try:
        quantity = Decimal(str(data["quantity"]))
    except (InvalidOperation, KeyError):
        raise _field("quantity", "Cantidad no válida.") from None
    if quantity <= 0 or quantity != quantity.quantize(Decimal("0.001")):
        raise _field("quantity", "Mayor que 0 y con hasta 3 decimales.")
    deadline: date = data["delivery_deadline"]
    if deadline < time_source.db_now().date():
        raise _field("delivery_deadline", "No puede estar en el pasado.")

    with transaction.atomic():
        return ProcurementRequest.objects.create(
            buyer_organization_id=organization_id,
            created_by_user_id=user.pk,
            title=data["title"].strip(),
            specifications=data["specifications"],
            quantity=quantity,
            unit=data["unit"].strip(),
            mandatory_requirements=_clean_requirements(data.get("mandatory_requirements", [])),
            delivery_deadline=deadline,
            delivery_location=data["delivery_location"].strip(),
        )


def list_for_organization(user, organization_id):
    """`/org/:orgId/necesidades`: necesidades de la organización (solo miembros activos)."""
    from apps.organizations import services as organizations

    if organizations.active_membership(user, organization_id) is None:
        raise NotFound()
    return (
        ProcurementRequest.objects.filter(buyer_organization_id=organization_id)
        .select_related("buyer_organization")
        .order_by("-created_at")
    )


def auction_info(need_ids) -> dict[str, dict]:
    """Subasta asociada a cada necesidad y número de proveedores admitidos (dato público).

    `status` es el estado EFECTIVO según la hora de PostgreSQL (LX-53): una inversa ya empezada
    dice `active` aunque el job todavía no haya materializado el cambio.
    """
    from django.db.models import Count, Q

    from apps.auctions.models import Auction
    from apps.auctions.services.snapshot import evaluate
    from apps.core.time import time_source

    auctions = list(
        Auction.objects.filter(procurement_request_id__in=list(need_ids))
        .select_related("procurement_request")
        .annotate(admitted=Count("auctionparticipant", filter=Q(auctionparticipant__status="admitted")))
    )
    if not auctions:
        return {}
    now = time_source.db_now()
    return {
        str(a.procurement_request_id): {
            "id": str(a.pk),
            "status": evaluate(a, now).status,
            "starts_at": a.starts_at,
            "ends_at": a.ends_at,
            "admitted_count": a.admitted,
        }
        for a in auctions
    }


def get_public(request_id) -> ProcurementRequest:
    obj = ProcurementRequest.objects.select_related("buyer_organization").filter(pk=request_id).first()
    if obj is None:
        raise NotFound()
    return obj
