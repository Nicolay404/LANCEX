/**
 * Capacidades que llegan en `GET /auth/me` (ADR-0006, ROLES-Y-PERMISOS.md).
 * Sirven SOLO para decidir qué se muestra y qué rutas se registran: la autorización real
 * la hace el backend en cada petición.
 */
import type { UserMe, UserOrganization } from '@/api/types'

export const Cap = {
  CATALOG_VIEW: 'catalog.view',
  ACCOUNT_MANAGE_OWN: 'account.manage_own',
  NOTIFICATION_READ_OWN: 'notification.read_own',
  LISTING_MANAGE_OWN: 'listing.manage_own',
  AUCTION_CREATE_PERSONAL: 'auction.create_personal',
  AUCTION_MANAGE_OWN: 'auction.manage_own',
  BID_PLACE: 'bid.place',
  PROXY_MANAGE_OWN: 'proxy.manage_own',
  SEALED_MANAGE_OWN: 'sealed.manage_own',
  WATCHLIST_MANAGE_OWN: 'watchlist.manage_own',
  RATING_SUBMIT: 'rating.submit',
  REPORT_CREATE: 'report.create',
  ORGANIZATION_CREATE: 'organization.create',
  MODERATION_VERIFY_ORGANIZATIONS: 'moderation.verify_organizations',
  MODERATION_REVIEW_REPORTS: 'moderation.review_reports',
  MODERATION_CANCEL_AUCTION: 'moderation.cancel_auction',
  MODERATION_SUSPEND_USER: 'moderation.suspend_user',
  MODERATION_VIEW_AUCTION_INTERNALS: 'moderation.view_auction_internals',
  ADMIN_MANAGE_USERS: 'admin.manage_users',
  ADMIN_MANAGE_CATEGORIES: 'admin.manage_categories',
  ADMIN_VIEW_AUDIT: 'admin.view_audit',
  ADMIN_VIEW_SYSTEM_HEALTH: 'admin.view_system_health',
} as const

/** Capacidades por organización (`UserMe.organizations[].capabilities`). */
export const OrgCap = {
  ORG_VIEW: 'org.view',
  ORG_MANAGE_MEMBERS: 'org.manage_members',
  ORG_TRANSFER_OWNERSHIP: 'org.transfer_ownership',
  ORG_EDIT_PROFILE: 'org.edit_profile',
  PROCUREMENT_MANAGE: 'procurement.manage',
  AUCTION_CREATE_REVERSE: 'auction.create_reverse',
  PARTICIPANTS_DECIDE: 'participants.decide',
  REVERSE_REGISTER: 'reverse.register',
  REVERSE_BID: 'reverse.bid',
} as const

export type Capability = (typeof Cap)[keyof typeof Cap]
export type OrgCapability = (typeof OrgCap)[keyof typeof OrgCap]

export const MODERATION_CAPS: readonly Capability[] = [
  Cap.MODERATION_VERIFY_ORGANIZATIONS,
  Cap.MODERATION_REVIEW_REPORTS,
  Cap.MODERATION_CANCEL_AUCTION,
  Cap.MODERATION_SUSPEND_USER,
  Cap.MODERATION_VIEW_AUCTION_INTERNALS,
]

export const ADMIN_CAPS: readonly Capability[] = [
  Cap.ADMIN_MANAGE_USERS,
  Cap.ADMIN_MANAGE_CATEGORIES,
  Cap.ADMIN_VIEW_AUDIT,
  Cap.ADMIN_VIEW_SYSTEM_HEALTH,
]

export const BUYER_ORG_CAPS: readonly OrgCapability[] = [
  OrgCap.PROCUREMENT_MANAGE,
  OrgCap.AUCTION_CREATE_REVERSE,
  OrgCap.PARTICIPANTS_DECIDE,
]

export const SUPPLIER_ORG_CAPS: readonly OrgCapability[] = [
  OrgCap.REVERSE_REGISTER,
  OrgCap.REVERSE_BID,
]

export function hasCapability(me: UserMe | null | undefined, cap: Capability): boolean {
  return !!me && me.capabilities.includes(cap)
}

export function hasAnyCapability(
  me: UserMe | null | undefined,
  caps: readonly Capability[],
): boolean {
  return !!me && caps.some((c) => me.capabilities.includes(c))
}

export function orgHasAny(org: UserOrganization, caps: readonly OrgCapability[]): boolean {
  return caps.some((c) => org.capabilities.includes(c))
}

export function findOrganization(
  me: UserMe | null | undefined,
  orgId: string | undefined,
): UserOrganization | undefined {
  if (!me || !orgId) return undefined
  return me.organizations.find((o) => o.id === orgId)
}

export const PLATFORM_ROLE_LABEL: Record<string, string> = {
  user: 'Usuario',
  moderator: 'Moderador',
  admin: 'Administrador',
}
