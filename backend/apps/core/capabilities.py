"""Catálogo y cálculo de capacidades (ADR-0006, ROLES-Y-PERMISOS.md §3).

Python puro y determinista: recibe una instantánea del principal (rol, estado y membresías
leídos de la base en esta petición) y devuelve las capacidades. No conoce el ORM ni el
request; así se prueba sin base de datos y la misma regla sirve a vistas, servicios y comandos.

Reglas generales:
- Fallo cerrado: rol o estado desconocido = visitante.
- Cuenta suspendida o inactiva = visitante (sus sesiones además se revocan).
- Staff (`moderator`, `admin`) nunca recibe capacidades comerciales ni de organización.
- Las condiciones sobre objetos (dueño, admitido, conflicto de interés en una subasta concreta)
  NO se resuelven aquí: las revalidan los servicios (nivel 3).
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from enum import StrEnum


class PlatformRole(StrEnum):
    USER = "user"
    MODERATOR = "moderator"
    ADMIN = "admin"


class AccountStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class MembershipRole(StrEnum):
    OWNER = "owner"
    MEMBER = "member"


class MembershipStatus(StrEnum):
    ACTIVE = "active"
    REVOKED = "revoked"


class VerificationStatus(StrEnum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class Cap(StrEnum):
    """Capacidades globales."""

    CATALOG_VIEW = "catalog.view"
    ACCOUNT_MANAGE_OWN = "account.manage_own"
    NOTIFICATION_READ_OWN = "notification.read_own"
    LISTING_MANAGE_OWN = "listing.manage_own"
    AUCTION_CREATE_PERSONAL = "auction.create_personal"
    AUCTION_MANAGE_OWN = "auction.manage_own"
    BID_PLACE = "bid.place"
    PROXY_MANAGE_OWN = "proxy.manage_own"
    SEALED_MANAGE_OWN = "sealed.manage_own"
    WATCHLIST_MANAGE_OWN = "watchlist.manage_own"
    RATING_SUBMIT = "rating.submit"
    REPORT_CREATE = "report.create"
    ORGANIZATION_CREATE = "organization.create"
    MODERATION_VERIFY_ORGANIZATIONS = "moderation.verify_organizations"
    MODERATION_REVIEW_REPORTS = "moderation.review_reports"
    MODERATION_CANCEL_AUCTION = "moderation.cancel_auction"
    MODERATION_SUSPEND_USER = "moderation.suspend_user"
    MODERATION_VIEW_AUCTION_INTERNALS = "moderation.view_auction_internals"
    ADMIN_MANAGE_USERS = "admin.manage_users"
    ADMIN_MANAGE_CATEGORIES = "admin.manage_categories"
    ADMIN_VIEW_AUDIT = "admin.view_audit"
    ADMIN_VIEW_SYSTEM_HEALTH = "admin.view_system_health"


class OrgCap(StrEnum):
    """Capacidades contextuales, evaluadas por `organization_id`."""

    ORG_VIEW = "org.view"
    ORG_MANAGE_MEMBERS = "org.manage_members"
    ORG_TRANSFER_OWNERSHIP = "org.transfer_ownership"
    ORG_EDIT_PROFILE = "org.edit_profile"
    PROCUREMENT_MANAGE = "procurement.manage"
    AUCTION_CREATE_REVERSE = "auction.create_reverse"
    PARTICIPANTS_DECIDE = "participants.decide"
    REVERSE_REGISTER = "reverse.register"
    # `reverse.bid` exige además la inscripción `admitted` en una subasta concreta:
    # es una condición de objeto y la resuelve el servicio de ofertas inversas.
    REVERSE_BID = "reverse.bid"


GLOBAL_CAPABILITIES: frozenset[str] = frozenset(c.value for c in Cap)
ORGANIZATION_CAPABILITIES: frozenset[str] = frozenset(c.value for c in OrgCap)
ALL_CAPABILITIES: frozenset[str] = GLOBAL_CAPABILITIES | ORGANIZATION_CAPABILITIES

_VISITOR = frozenset({Cap.CATALOG_VIEW})
_AUTHENTICATED = _VISITOR | {Cap.ACCOUNT_MANAGE_OWN, Cap.NOTIFICATION_READ_OWN}
_USER = _AUTHENTICATED | {
    Cap.LISTING_MANAGE_OWN,
    Cap.AUCTION_CREATE_PERSONAL,
    Cap.AUCTION_MANAGE_OWN,
    Cap.BID_PLACE,
    Cap.PROXY_MANAGE_OWN,
    Cap.SEALED_MANAGE_OWN,
    Cap.WATCHLIST_MANAGE_OWN,
    Cap.RATING_SUBMIT,
    Cap.REPORT_CREATE,
    Cap.ORGANIZATION_CREATE,
}
_MODERATOR = _AUTHENTICATED | {
    Cap.MODERATION_VERIFY_ORGANIZATIONS,
    Cap.MODERATION_REVIEW_REPORTS,
    Cap.MODERATION_CANCEL_AUCTION,
    Cap.MODERATION_SUSPEND_USER,
    Cap.MODERATION_VIEW_AUCTION_INTERNALS,
}
_ADMIN = _MODERATOR | {
    Cap.ADMIN_MANAGE_USERS,
    Cap.ADMIN_MANAGE_CATEGORIES,
    Cap.ADMIN_VIEW_AUDIT,
    Cap.ADMIN_VIEW_SYSTEM_HEALTH,
}

_BY_ROLE: dict[str, frozenset[str]] = {
    PlatformRole.USER: frozenset(_USER),
    PlatformRole.MODERATOR: frozenset(_MODERATOR),
    PlatformRole.ADMIN: frozenset(_ADMIN),
}


@dataclass(frozen=True, slots=True)
class MembershipSnapshot:
    organization_id: str
    role: str
    status: str
    organization_verification_status: str
    is_buyer: bool
    is_supplier: bool


@dataclass(frozen=True, slots=True)
class Principal:
    """Quién hace la petición, leído de la base en esta misma petición."""

    user_id: str | None = None
    platform_role: str | None = None
    status: str | None = None
    is_active: bool = False
    memberships: tuple[MembershipSnapshot, ...] = field(default_factory=tuple)

    @property
    def is_authenticated(self) -> bool:
        return self.user_id is not None

    @property
    def is_operational(self) -> bool:
        """Sesión válida de una cuenta activa con rol conocido."""
        return (
            self.is_authenticated
            and self.is_active
            and self.status == AccountStatus.ACTIVE
            and self.platform_role in _BY_ROLE
        )

    @property
    def is_staff(self) -> bool:
        return self.platform_role in (PlatformRole.MODERATOR, PlatformRole.ADMIN)


ANONYMOUS = Principal()


def global_capabilities(principal: Principal) -> frozenset[str]:
    if not principal.is_operational:
        return frozenset(_VISITOR)
    return _BY_ROLE[principal.platform_role]


def organization_capabilities(principal: Principal, membership: MembershipSnapshot) -> frozenset[str]:
    """Capacidades del principal dentro de una organización concreta."""
    if not principal.is_operational or principal.is_staff:
        return frozenset()
    if membership.status != MembershipStatus.ACTIVE:
        return frozenset()

    caps: set[str] = {OrgCap.ORG_VIEW}
    if membership.role == MembershipRole.OWNER:
        caps |= {OrgCap.ORG_MANAGE_MEMBERS, OrgCap.ORG_TRANSFER_OWNERSHIP, OrgCap.ORG_EDIT_PROFILE}

    if membership.organization_verification_status == VerificationStatus.VERIFIED:
        if membership.is_buyer:
            caps |= {OrgCap.PROCUREMENT_MANAGE, OrgCap.AUCTION_CREATE_REVERSE, OrgCap.PARTICIPANTS_DECIDE}
        if membership.is_supplier:
            caps.add(OrgCap.REVERSE_REGISTER)
    return frozenset(caps)


@dataclass(frozen=True, slots=True)
class CapabilitySet:
    """Resultado del cálculo para una petición: global + por organización."""

    principal: Principal
    global_caps: frozenset[str]
    by_organization: dict[str, frozenset[str]]

    def has(self, capability: str) -> bool:
        return capability in self.global_caps

    def has_in_organization(self, capability: str, organization_id: str | None) -> bool:
        if organization_id is None:
            return False
        return capability in self.by_organization.get(str(organization_id), frozenset())

    def organizations_with(self, capability: str) -> list[str]:
        return [org_id for org_id, caps in self.by_organization.items() if capability in caps]


def compute(principal: Principal) -> CapabilitySet:
    by_org = {
        m.organization_id: caps for m in principal.memberships if (caps := organization_capabilities(principal, m))
    }
    return CapabilitySet(principal, global_capabilities(principal), by_org)


def unknown_capabilities(names: Iterable[str]) -> list[str]:
    return sorted(set(names) - ALL_CAPABILITIES)
