"""Organizaciones B2B y membresías (LX-50, REGLAS-DE-SUBASTAS.md §8 y §15, ROLES-Y-PERMISOS.md).

Los servicios revalidan la membresía en cada operación (no confían en la vista) y auditan en la
misma transacción. Staff no pertenece a organizaciones (sin actividad comercial).
"""

from __future__ import annotations

import re

from django.db import IntegrityError, transaction

from apps.accounts.models import User
from apps.audit.services import record
from apps.core.capabilities import AccountStatus, MembershipRole, MembershipStatus, PlatformRole, VerificationStatus
from apps.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from apps.organizations.models import Organization, OrganizationMembership

RUC = re.compile(r"^[0-9]{13}$")


def _field(field: str, message: str) -> ValidationFailed:
    return ValidationFailed(details={"fields": {field: [message]}})


def _ensure_commercial(user: User) -> None:
    if user.platform_role != PlatformRole.USER or user.status != AccountStatus.ACTIVE or not user.is_active:
        raise Forbidden()


def _validate_profile(legal_name, ruc, is_buyer, is_supplier) -> None:
    if legal_name is not None and not 3 <= len(legal_name.strip()) <= 160:
        raise _field("legal_name", "Debe tener entre 3 y 160 caracteres.")
    if ruc is not None and not RUC.match(ruc):
        raise _field("ruc", "El RUC debe tener 13 dígitos.")
    if is_buyer is not None and is_supplier is not None and not (is_buyer or is_supplier):
        raise _field("is_buyer", "La organización debe ser compradora, proveedora o ambas.")


def active_membership(user, organization_id) -> OrganizationMembership | None:
    if user is None or not user.is_authenticated or user.platform_role != PlatformRole.USER:
        return None
    return (
        OrganizationMembership.objects.select_related("organization")
        .filter(organization_id=organization_id, user_id=user.pk, status=MembershipStatus.ACTIVE)
        .first()
    )


def member_organization_ids(user) -> set[str]:
    if user is None or not user.is_authenticated or user.platform_role != PlatformRole.USER:
        return set()
    rows = OrganizationMembership.objects.filter(user_id=user.pk, status=MembershipStatus.ACTIVE)
    return {str(o) for o in rows.values_list("organization_id", flat=True)}


def _require_member(user, organization_id, *, owner: bool = False) -> OrganizationMembership:
    membership = active_membership(user, organization_id)
    if membership is None:
        raise NotFound()  # no revela la existencia de organizaciones ajenas
    if owner and membership.role != MembershipRole.OWNER:
        raise Forbidden()
    return membership


def create_organization(user: User, *, legal_name: str, ruc: str, is_buyer: bool, is_supplier: bool) -> Organization:
    _ensure_commercial(user)
    _validate_profile(legal_name, ruc, is_buyer, is_supplier)
    with transaction.atomic():
        try:
            with transaction.atomic():
                org = Organization.objects.create(
                    legal_name=legal_name.strip(),
                    ruc=ruc,
                    is_buyer=is_buyer,
                    is_supplier=is_supplier,
                    created_by_user_id=user.pk,
                )
        except IntegrityError:
            raise Conflict(code="RUC_ALREADY_REGISTERED", message="Ya existe una organización con ese RUC.") from None
        OrganizationMembership.objects.create(organization=org, user_id=user.pk, role=MembershipRole.OWNER)
        record(
            "organization_created",
            actor_user_id=user.pk,
            entity_type="organization",
            entity_id=org.pk,
            data={"is_buyer": is_buyer, "is_supplier": is_supplier},
        )
    return org


def get_organization(user, organization_id) -> tuple[Organization, OrganizationMembership, list]:
    membership = _require_member(user, organization_id)
    members = list(
        OrganizationMembership.objects.select_related("user")
        .filter(organization_id=organization_id)
        .order_by("-role", "created_at")
    )
    return membership.organization, membership, members


def update_organization(user: User, organization_id, **changes) -> Organization:
    """Cambiar razón social o RUC de una verificada la devuelve a `pending`; editar una rechazada también."""
    _ensure_commercial(user)
    with transaction.atomic():
        _require_member(user, organization_id, owner=True)
        org = Organization.objects.select_for_update().get(pk=organization_id)
        merged = {k: changes.get(k, getattr(org, k)) for k in ("legal_name", "ruc", "is_buyer", "is_supplier")}
        _validate_profile(**merged)
        merged["legal_name"] = merged["legal_name"].strip()
        identity_changed = merged["legal_name"] != org.legal_name or merged["ruc"] != org.ruc
        back_to_pending = (identity_changed and org.verification_status == VerificationStatus.VERIFIED) or (
            org.verification_status == VerificationStatus.REJECTED
        )
        for key, value in merged.items():
            setattr(org, key, value)
        if back_to_pending:
            org.verification_status = VerificationStatus.PENDING
            org.verification_note = None
        try:
            with transaction.atomic():
                org.save(update_fields=[*merged.keys(), "verification_status", "verification_note"])
        except IntegrityError:
            raise Conflict(code="RUC_ALREADY_REGISTERED", message="Ya existe una organización con ese RUC.") from None
        record(
            "organization_updated",
            actor_user_id=user.pk,
            entity_type="organization",
            entity_id=org.pk,
            data={"fields": sorted(changes), "back_to_pending": back_to_pending},
        )
    return org


def add_member(user: User, organization_id, *, email: str) -> OrganizationMembership:
    _ensure_commercial(user)
    with transaction.atomic():
        _require_member(user, organization_id, owner=True)
        target = User.objects.filter(email__iexact=email.strip()).first()
        if target is None or target.platform_role != PlatformRole.USER or target.status != AccountStatus.ACTIVE:
            # Mensaje genérico: no confirma si el email existe ni si es staff.
            raise _field("email", "No se puede agregar a ese usuario.")
        existing = (
            OrganizationMembership.objects.select_for_update()
            .filter(organization_id=organization_id, user_id=target.pk)
            .first()
        )
        if existing and existing.status == MembershipStatus.ACTIVE:
            raise Conflict(code="ALREADY_MEMBER", message="El usuario ya es miembro.")
        if existing:
            existing.status = MembershipStatus.ACTIVE
            existing.role = MembershipRole.MEMBER
            existing.save(update_fields=["status", "role"])
            membership = existing
        else:
            membership = OrganizationMembership.objects.create(
                organization_id=organization_id, user_id=target.pk, role=MembershipRole.MEMBER
            )
        record(
            "organization_member_added",
            actor_user_id=user.pk,
            entity_type="organization",
            entity_id=organization_id,
            data={"user_id": str(target.pk)},
        )
    return membership


def _active_owners(organization_id):
    return OrganizationMembership.objects.filter(
        organization_id=organization_id, role=MembershipRole.OWNER, status=MembershipStatus.ACTIVE
    )


def revoke_member(user: User, organization_id, target_user_id) -> None:
    """Revocar no deshace lo hecho en nombre de la organización: solo impide actuar desde ahora (§15)."""
    _ensure_commercial(user)
    with transaction.atomic():
        _require_member(user, organization_id, owner=True)
        Organization.objects.select_for_update().get(pk=organization_id)  # serializa cambios de propietarios
        target = OrganizationMembership.objects.filter(
            organization_id=organization_id, user_id=target_user_id, status=MembershipStatus.ACTIVE
        ).first()
        if target is None:
            raise NotFound()
        if target.role == MembershipRole.OWNER and _active_owners(organization_id).count() <= 1:
            raise Conflict(code="LAST_OWNER", message="Transfiere la propiedad antes de retirar al último owner.")
        target.status = MembershipStatus.REVOKED
        target.save(update_fields=["status"])
        record(
            "organization_member_revoked",
            actor_user_id=user.pk,
            entity_type="organization",
            entity_id=organization_id,
            data={"user_id": str(target_user_id)},
        )


def transfer_ownership(user: User, organization_id, *, new_owner_user_id, password: str) -> None:
    """Step-up: exige la contraseña (SEGURIDAD §3.10). El owner anterior pasa a `member`."""
    _ensure_commercial(user)
    if not user.check_password(password):
        raise Forbidden(code="STEP_UP_FAILED", message="La contraseña no es correcta.")
    with transaction.atomic():
        mine = _require_member(user, organization_id, owner=True)
        Organization.objects.select_for_update().get(pk=organization_id)
        target = OrganizationMembership.objects.filter(
            organization_id=organization_id, user_id=new_owner_user_id, status=MembershipStatus.ACTIVE
        ).first()
        if target is None or str(target.user_id) == str(user.pk):
            raise _field("new_owner_user_id", "Debe ser otro miembro activo de la organización.")
        target.role = MembershipRole.OWNER
        target.save(update_fields=["role"])
        mine.role = MembershipRole.MEMBER
        mine.save(update_fields=["role"])
        record(
            "organization_ownership_transferred",
            actor_user_id=user.pk,
            entity_type="organization",
            entity_id=organization_id,
            data={"new_owner_user_id": str(new_owner_user_id)},
        )


# --- Moderación: verificación (adelanto de LX-77, imprescindible para la Fase 5) -----------------


def organizations_for_review(status: str | None):
    qs = Organization.objects.select_related("created_by_user").order_by("created_at")
    if status:
        if status not in {s.value for s in VerificationStatus}:
            raise _field("status", "Estado no válido.")
        qs = qs.filter(verification_status=status)
    return qs


def organization_for_review(organization_id):
    org = Organization.objects.select_related("created_by_user").filter(pk=organization_id).first()
    if org is None:
        raise NotFound()
    members = list(
        OrganizationMembership.objects.select_related("user")
        .filter(organization_id=organization_id)
        .order_by("-role", "created_at")
    )
    return org, members


def decide_verification(moderator: User, organization_id, *, status: str, note: str) -> Organization:
    if moderator.platform_role not in (PlatformRole.MODERATOR, PlatformRole.ADMIN):
        raise Forbidden()
    if status not in (VerificationStatus.VERIFIED, VerificationStatus.REJECTED):
        raise _field("status", "Usa verified o rejected.")
    with transaction.atomic():
        org = Organization.objects.select_for_update().filter(pk=organization_id).first()
        if org is None:
            raise NotFound()
        org.verification_status = status
        org.verification_note = note
        org.save(update_fields=["verification_status", "verification_note"])
        record(
            "organization_verified" if status == VerificationStatus.VERIFIED else "organization_rejected",
            actor_user_id=moderator.pk,
            entity_type="organization",
            entity_id=org.pk,
            data={"note": note},
        )
        _notify_owners(org, status, note)
    return org


def _notify_owners(org: Organization, status: str, note: str) -> None:
    """Aviso a los owners activos de la decisión de verificación."""
    from apps.notifications import services as notifications

    owners = OrganizationMembership.objects.filter(
        organization_id=org.pk, role=MembershipRole.OWNER, status=MembershipStatus.ACTIVE
    ).values_list("user_id", flat=True)
    notifications.notify(
        owners,
        "organization_verified" if status == VerificationStatus.VERIFIED else "organization_rejected",
        data={"organization_name": org.legal_name, "reason": note},
    )
