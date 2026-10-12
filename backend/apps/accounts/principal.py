"""Adaptador ORM -> `Principal` para el cálculo de capacidades (ADR-0006).

Lee rol, estado y membresías desde la base en cada petición (con una sola consulta de
membresías). Se configura en `settings.LANCEX_PRINCIPAL_LOADER`.
"""

from apps.core.capabilities import MembershipSnapshot, MembershipStatus, PlatformRole, Principal
from apps.organizations.models import OrganizationMembership


def load_principal(user) -> Principal:
    memberships: tuple[MembershipSnapshot, ...] = ()
    # Staff no tiene actividad comercial: ni siquiera se consultan sus membresías.
    if user.platform_role == PlatformRole.USER:
        rows = (
            OrganizationMembership.objects.filter(user_id=user.pk, status=MembershipStatus.ACTIVE)
            .select_related("organization")
            .only(
                "organization_id",
                "role",
                "status",
                "organization__verification_status",
                "organization__is_buyer",
                "organization__is_supplier",
            )
        )
        memberships = tuple(
            MembershipSnapshot(
                organization_id=str(m.organization_id),
                role=m.role,
                status=m.status,
                organization_verification_status=m.organization.verification_status,
                is_buyer=m.organization.is_buyer,
                is_supplier=m.organization.is_supplier,
            )
            for m in rows
        )
    return Principal(
        user_id=str(user.pk),
        platform_role=user.platform_role,
        status=user.status,
        is_active=user.is_active,
        memberships=memberships,
    )
