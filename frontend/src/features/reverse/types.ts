/** B2B inverso: necesidades, inscripción de proveedores y ofertas (LX-51/52, REGLAS §7 y §15). */
import type { IsoDateTime, Money, Uuid } from '@/api/types'

export interface Requirement {
  code: string
  description: string
}

/** `GET /procurement-requests/{id}/` (público). */
export interface ProcurementRequest {
  id: Uuid
  buyer_organization: { id: Uuid; legal_name: string }
  title: string
  specifications: string
  /** Cadena con 3 decimales: `"100.000"`. */
  quantity: string
  unit: string
  mandatory_requirements: Requirement[]
  /** Fecha `YYYY-MM-DD`. */
  delivery_deadline: string
  delivery_location: string
  created_at: IsoDateTime
  /** Subasta asociada (null si todavía no tiene). */
  auction: NeedAuction | null
}

export interface NeedAuction {
  id: Uuid
  status: string
  starts_at: IsoDateTime | null
  ends_at: IsoDateTime | null
  admitted_count: number
}

export interface ProcurementInput {
  organization_id: Uuid
  title: string
  specifications: string
  quantity: string
  unit: string
  mandatory_requirements: Requirement[]
  delivery_deadline: string
  delivery_location: string
}

/** `AuctionDetail.reverse` (solo en subastas inversas). */
export interface ReverseInfo {
  buyer_organization: { id: Uuid; legal_name: string }
  procurement_request_id: Uuid
  specifications: string
  quantity: string
  unit: string
  mandatory_requirements: Requirement[]
  delivery_deadline: string
  delivery_location: string
  reference_budget: Money
  min_decrement: Money
  admitted_count: number
  legal_notice: string
}

export interface ComplianceItem {
  code: string
  complies: boolean
  comment: string
}

export type ParticipantStatus = 'registered' | 'admitted' | 'rejected'

export interface Participant {
  id: Uuid
  organization: { id: Uuid; legal_name: string }
  status: ParticipantStatus
  compliance: ComplianceItem[]
  decision_reason: string | null
  registered_at: IsoDateTime
  decided_at: IsoDateTime | null
}

export const PARTICIPANT_STATUS_LABEL: Record<string, string> = {
  registered: 'Pendiente de revisión',
  admitted: 'Admitida',
  rejected: 'Rechazada',
}

export function rejectionText(reason: string | null): string | null {
  if (!reason) return null
  return reason === 'not_reviewed' ? 'No se revisó antes del inicio' : reason
}

export interface ReverseAuctionInput {
  mechanism: 'reverse'
  closing_policy: 'fixed' | 'soft_close'
  proxy_enabled: false
  organization_id: Uuid
  procurement_request_id: Uuid
  reference_budget: Money
  min_decrement: Money
  starts_at: string
  ends_at: string
  soft_close_window_s?: number
  soft_close_extension_s?: number
  soft_close_max_total_s?: number
}

/** `GET /organizations/{id}/opportunities/`: inversas abiertas para mi proveedora, sin conflictos. */
export interface Opportunity {
  auction_id: Uuid
  title: string | null
  buyer_organization: string | null
  phase: 'registration' | 'bidding'
  starts_at: IsoDateTime
  ends_at: IsoDateTime
  reference_budget: Money | null
  quantity: string | null
  unit: string | null
  my_registration: { id: Uuid; status: ParticipantStatus } | null
}

/** `GET /organizations/{id}/registrations/`: inscripciones de mi organización proveedora. */
export interface Registration extends Participant {
  auction: {
    id: Uuid
    title: string | null
    status: string
    starts_at: IsoDateTime | null
    ends_at: IsoDateTime | null
  }
}
