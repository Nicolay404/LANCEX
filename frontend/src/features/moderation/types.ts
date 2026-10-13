/** Moderación (LX-77 backend / LX-78 frontend). Staff ve emails; nunca máximos proxy ni ofertas sin revelar. */
import type { IsoDateTime, Money, Uuid } from '@/api/types'
import type { AuctionStatus, ClosingPolicy, Mechanism } from '@/features/auctions/types'

export interface ModerationSummary {
  pending_organizations: number
  open_reports: number
  active_auctions: number
  suspended_users: number
  reported_active_auctions: number
}

export type ReportStatus = 'open' | 'dismissed' | 'actioned'
export type ResolveAction = 'none' | 'cancel_auction' | 'suspend_user'

export interface ModerationReport {
  id: Uuid
  target_type: 'auction' | 'listing' | 'user'
  target_id: Uuid
  reason: string
  detail: string
  status: ReportStatus
  reporter: { id: Uuid; display_name: string }
  resolution_note: string | null
  created_at: IsoDateTime
  resolved_at: IsoDateTime | null
}

export interface AuditRow {
  id: number
  occurred_at: IsoDateTime
  actor_user_id: Uuid | null
  action: string
  entity_type: string
  entity_id: string | null
  auction_id: Uuid | null
  request_id: string | null
  data: Record<string, unknown>
}

export interface ModerationAuction {
  auction: {
    id: Uuid
    mechanism: Mechanism
    closing_policy: ClosingPolicy
    status: AuctionStatus
    outcome: string | null
    owner: { id: Uuid; display_name: string }
    current_price: Money | null
    reserve_price: Money | null
    bid_count: number | null
    active_offer_count: number | null
    starts_at: IsoDateTime | null
    ends_at: IsoDateTime | null
    winner_user_id: Uuid | null
    final_price: Money | null
    cancel_reason: string | null
  }
  bids: {
    seq: number
    amount: Money
    source: string
    accepted_at: IsoDateTime
    counted: boolean | null
    bidder: { id: Uuid; display_name: string }
  }[]
  /** Solo tras la revelación (sellado cerrado); antes llega vacío. */
  sealed_offers: {
    seq: number
    amount: Money
    status: string
    is_current: boolean
    submitted_at: IsoDateTime
    bidder: { id: Uuid; display_name: string }
  }[]
  audit_events: AuditRow[]
}

export interface StaffUserRow {
  id: Uuid
  email: string
  display_name: string
  platform_role: string
  status: string
  status_reason: string | null
  created_at: IsoDateTime
  last_login: IsoDateTime | null
}

export interface UserFile {
  user: StaffUserRow
  auctions_owned: number
  bids_placed: number
  reports_received: number
  reports_made: number
  recent_events: AuditRow[]
}

export interface OrganizationReview {
  id: Uuid
  legal_name: string
  ruc: string
  is_buyer: boolean
  is_supplier: boolean
  verification_status: 'pending' | 'verified' | 'rejected'
  verification_note: string | null
  created_at: IsoDateTime
  created_by: { id: Uuid; display_name: string }
}

export interface OrganizationReviewDetail extends OrganizationReview {
  members: { user_id: Uuid; display_name: string; email: string; role: string; status: string }[]
}

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  open: 'Abierto',
  dismissed: 'Descartado',
  actioned: 'Con acción',
}

export const REPORT_TARGET_LABEL: Record<string, string> = {
  auction: 'Subasta',
  listing: 'Publicación',
  user: 'Usuario',
}

export const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  active: 'Activa',
  suspended: 'Suspendida',
}

/** Motivo del reporte: el texto sale de la lista de `reports/api` cuando existe. */
export const RESOLVE_ACTION_LABEL: Record<ResolveAction, string> = {
  none: 'Descartar (sin acción)',
  cancel_auction: 'Cancelar la subasta',
  suspend_user: 'Suspender al usuario responsable',
}
