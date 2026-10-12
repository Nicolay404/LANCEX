"""Matriz de capacidades de ROLES-Y-PERMISOS.md §3 (sin base de datos)."""

import pytest

from apps.core.capabilities import (
    ALL_CAPABILITIES,
    ANONYMOUS,
    Cap,
    MembershipSnapshot,
    OrgCap,
    Principal,
    compute,
    global_capabilities,
    organization_capabilities,
    unknown_capabilities,
)

ORG = "11111111-1111-1111-1111-111111111111"

COMMERCIAL = {
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
MODERATION = {c for c in Cap if c.startswith("moderation.")}
ADMIN = {c for c in Cap if c.startswith("admin.")}


def principal(role="user", status="active", is_active=True, memberships=()):
    return Principal(user_id="u-1", platform_role=role, status=status, is_active=is_active, memberships=memberships)


def membership(role="member", status="active", verification="verified", buyer=False, supplier=False, org=ORG):
    return MembershipSnapshot(org, role, status, verification, buyer, supplier)


class TestGlobalCapabilities:
    def test_visitor_only_views_catalog(self):
        assert global_capabilities(ANONYMOUS) == {Cap.CATALOG_VIEW}

    def test_user_has_commercial_capabilities_and_nothing_of_staff(self):
        caps = global_capabilities(principal("user"))
        assert caps >= COMMERCIAL | {Cap.CATALOG_VIEW, Cap.ACCOUNT_MANAGE_OWN, Cap.NOTIFICATION_READ_OWN}
        assert not caps & (MODERATION | ADMIN)

    def test_moderator_has_moderation_but_no_commercial_nor_admin(self):
        caps = global_capabilities(principal("moderator"))
        assert caps >= MODERATION
        assert not caps & (COMMERCIAL | ADMIN)

    def test_admin_has_moderation_and_admin_but_no_commercial(self):
        caps = global_capabilities(principal("admin"))
        assert caps >= MODERATION | ADMIN
        assert not caps & COMMERCIAL

    @pytest.mark.parametrize("role", ["user", "moderator", "admin"])
    def test_every_authenticated_role_manages_own_account(self, role):
        caps = global_capabilities(principal(role))
        assert {Cap.CATALOG_VIEW, Cap.ACCOUNT_MANAGE_OWN, Cap.NOTIFICATION_READ_OWN} <= caps

    @pytest.mark.parametrize(
        "kwargs",
        [
            {"status": "suspended"},
            {"is_active": False},
            {"role": "superuser"},  # rol desconocido: fallo cerrado
            {"role": None},
            {"status": "weird"},
        ],
    )
    def test_fail_closed_to_visitor(self, kwargs):
        assert global_capabilities(principal(**kwargs)) == {Cap.CATALOG_VIEW}


class TestOrganizationCapabilities:
    def test_member_of_verified_buyer(self):
        caps = organization_capabilities(principal(), membership(buyer=True))
        assert caps == {
            OrgCap.ORG_VIEW,
            OrgCap.PROCUREMENT_MANAGE,
            OrgCap.AUCTION_CREATE_REVERSE,
            OrgCap.PARTICIPANTS_DECIDE,
        }

    def test_owner_adds_management(self):
        caps = organization_capabilities(principal(), membership(role="owner", supplier=True))
        assert {OrgCap.ORG_MANAGE_MEMBERS, OrgCap.ORG_TRANSFER_OWNERSHIP, OrgCap.ORG_EDIT_PROFILE} <= caps
        assert OrgCap.REVERSE_REGISTER in caps
        assert OrgCap.AUCTION_CREATE_REVERSE not in caps

    @pytest.mark.parametrize("verification", ["pending", "rejected"])
    def test_unverified_org_has_no_b2b_capabilities(self, verification):
        caps = organization_capabilities(
            principal(), membership(role="owner", verification=verification, buyer=True, supplier=True)
        )
        assert caps == {
            OrgCap.ORG_VIEW,
            OrgCap.ORG_MANAGE_MEMBERS,
            OrgCap.ORG_TRANSFER_OWNERSHIP,
            OrgCap.ORG_EDIT_PROFILE,
        }

    def test_revoked_membership_grants_nothing(self):
        assert organization_capabilities(principal(), membership(status="revoked", buyer=True)) == frozenset()

    @pytest.mark.parametrize("role", ["moderator", "admin"])
    def test_staff_never_gets_organization_capabilities(self, role):
        assert organization_capabilities(principal(role), membership(role="owner", buyer=True)) == frozenset()

    def test_suspended_user_gets_no_organization_capabilities(self):
        assert organization_capabilities(principal(status="suspended"), membership(buyer=True)) == frozenset()

    def test_reverse_bid_is_never_granted_at_org_level(self):
        """`reverse.bid` depende de la admisión en una subasta: condición de objeto (servicio)."""
        caps = organization_capabilities(principal(), membership(role="owner", buyer=True, supplier=True))
        assert OrgCap.REVERSE_BID not in caps


class TestCapabilitySet:
    def test_capabilities_are_scoped_per_organization(self):
        other = "22222222-2222-2222-2222-222222222222"
        result = compute(principal(memberships=(membership(buyer=True), membership(org=other, supplier=True))))
        assert result.has_in_organization(OrgCap.AUCTION_CREATE_REVERSE, ORG)
        assert not result.has_in_organization(OrgCap.AUCTION_CREATE_REVERSE, other)
        assert result.has_in_organization(OrgCap.REVERSE_REGISTER, other)
        assert result.organizations_with(OrgCap.REVERSE_REGISTER) == [other]

    def test_no_organization_id_means_no_contextual_capability(self):
        result = compute(principal(memberships=(membership(buyer=True),)))
        assert not result.has_in_organization(OrgCap.ORG_VIEW, None)

    def test_org_capabilities_are_not_global(self):
        result = compute(principal(memberships=(membership(buyer=True),)))
        assert not result.has(OrgCap.AUCTION_CREATE_REVERSE)


def test_catalog_has_no_duplicates_and_detects_typos():
    assert len(ALL_CAPABILITIES) == len(Cap) + len(OrgCap)
    assert unknown_capabilities(["bid.place", "bid.plcae"]) == ["bid.plcae"]
