/**
 * Tipos manuales del contrato v1 (CONTRATO-API-INICIAL.md).
 * Se reemplazarán por los generados con openapi-typescript desde /api/v1/schema/.
 * No inventar campos: si algo no está en el contrato, no va aquí.
 */

/** Importe decimal como string (`"125.00"`). Nunca `number`. */
export type Money = string

/** Instante ISO-8601 con zona. */
export type IsoDateTime = string

export type Uuid = string

export type PlatformRole = 'user' | 'moderator' | 'admin'

export type OrganizationRole = 'owner' | 'admin' | 'member' | (string & {})

export type VerificationStatus = 'pending' | 'verified' | 'rejected' | (string & {})

export interface UserOrganization {
  id: Uuid
  legal_name: string
  role: OrganizationRole
  verification_status: VerificationStatus
  is_buyer: boolean
  is_supplier: boolean
  capabilities: string[]
}

/** `GET /auth/me/`: única fuente para construir la interfaz (ADR-0006). */
export interface UserMe {
  id: Uuid
  email: string
  display_name: string
  /** Perfil público opcional. */
  bio?: string | null
  location_city?: string | null
  platform_role: PlatformRole
  capabilities: string[]
  organizations: UserOrganization[]
  server_time: IsoDateTime
}

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface PageParams {
  page?: number
  /** Máximo 50 según el contrato. */
  page_size?: number
}
