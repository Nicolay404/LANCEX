/** Organizaciones B2B (`/organizations/…`, LX-50). */
import type { IsoDateTime, Uuid } from '@/api/types'

export type MemberRole = 'owner' | 'member'

export interface OrganizationMember {
  user_id: Uuid
  display_name: string
  role: MemberRole
  status: string
}

/** `GET|PATCH /organizations/{id}/` y respuesta de `POST /organizations/`. */
export interface Organization {
  id: Uuid
  legal_name: string
  ruc: string
  is_buyer: boolean
  is_supplier: boolean
  verification_status: 'pending' | 'verified' | 'rejected'
  verification_note: string | null
  created_at: IsoDateTime
  my_role: MemberRole
  members: OrganizationMember[]
}

export interface OrganizationInput {
  legal_name: string
  ruc: string
  is_buyer: boolean
  is_supplier: boolean
}

export const VERIFICATION_LABEL: Record<string, string> = {
  pending: 'Verificación pendiente',
  verified: 'Verificada',
  rejected: 'Rechazada',
}

export const MEMBER_ROLE_LABEL: Record<string, string> = {
  owner: 'Propietaria/o',
  member: 'Miembro',
}

/** Mismas reglas que el backend (`_validate_profile`): el servidor revalida siempre. */
export const RUC_RE = /^\d{13}$/
export const LEGAL_NAME_MIN = 3
export const LEGAL_NAME_MAX = 160
