import type { UserMe, UserOrganization } from '@/api/types'
import { OrgCap } from '@/features/auth/capabilities'

/** Organizaciones proveedoras verificadas del usuario (capacidad `reverse.register`). */
export function supplierOrganizations(me: UserMe | null): UserOrganization[] {
  return me?.organizations.filter((o) => o.capabilities.includes(OrgCap.REVERSE_REGISTER)) ?? []
}

/** Membresía del usuario en la compradora de la subasta, si puede calificar proveedores. */
export function buyerOrganization(
  me: UserMe | null,
  buyerOrganizationId: string,
): UserOrganization | undefined {
  return me?.organizations.find(
    (o) => o.id === buyerOrganizationId && o.capabilities.includes(OrgCap.PARTICIPANTS_DECIDE),
  )
}
