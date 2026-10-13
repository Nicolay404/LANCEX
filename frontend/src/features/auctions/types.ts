/** Subastas (CONTRATO-API-INICIAL.md §Subastas y matriz de visibilidad). */
import type { IsoDateTime, Money, Uuid } from '@/api/types'

export type Mechanism = 'ascending' | 'sealed' | 'reverse'
export type ClosingPolicy = 'fixed' | 'soft_close' | 'candle'
export type AuctionStatus = 'draft' | 'scheduled' | 'active' | 'closed' | 'cancelled'

/** Elemento del catálogo (`GET /auctions/`). */
export interface AuctionSummary {
  id: Uuid
  mechanism: Mechanism
  closing_policy: ClosingPolicy
  status: AuctionStatus
  result_pending: boolean
  title: string | null
  category: { id: number; name: string } | null
  currency: string
  current_price: Money | null
  minimum_next_bid: Money | null
  maximum_allowed: Money | null
  bid_count: number | null
  active_offer_count: number | null
  starts_at: IsoDateTime | null
  ends_at: IsoDateTime | null
}

export interface AuctionViewer {
  is_owner: boolean
  is_leader: boolean
  watching: boolean
  my_proxy_max: Money | null
  my_sealed_offer: Money | null
}

export interface SoftCloseInfo {
  window_s: number
  extension_s: number
  max_total_s: number
  original_ends_at: IsoDateTime | null
  extended: boolean
}

export interface CandleInfo {
  window_start: IsoDateTime
  window_s: number
  commitment: string
  in_window: boolean
  price_is_provisional: boolean
  notice: string | null
  close_at: IsoDateTime | null
}

/** Detalle (`GET /auctions/{id}/`). Campos privados solo llegan a quien puede verlos. */
export interface AuctionDetail extends AuctionSummary {
  proxy_enabled: boolean
  description: string | null
  item_condition: string | null
  location_city: string | null
  images: { url: string; position: number }[]
  seller: { id: Uuid; display_name: string; rating_avg: string | null; rating_count: number }
  starting_price: Money | null
  min_increment: Money | null
  has_reserve: boolean
  reserve_met: boolean | null
  soft_close: SoftCloseInfo | null
  candle: CandleInfo | null
  server_time: IsoDateTime
  version: number
  /** Solo dueño o staff. */
  reserve_price?: Money | null
  published_at?: IsoDateTime | null
  cancel_reason?: string | null
  viewer?: AuctionViewer
}

/** `GET /auctions/{id}/live/` (polling con ETag). */
export interface AuctionLive {
  version: number
  status: AuctionStatus
  result_pending: boolean
  current_price: Money | null
  minimum_next_bid: Money | null
  maximum_allowed: Money | null
  bid_count: number | null
  active_offer_count: number | null
  ends_at: IsoDateTime | null
  reserve_met: boolean | null
  server_time: IsoDateTime
  viewer_is_leader: boolean
}

export interface BidHistoryItem {
  seq: number
  amount: Money
  source: 'manual' | 'proxy' | string
  accepted_at: IsoDateTime
  /** "Postor N" o "Tú". */
  bidder: string
  counted: boolean | null
}

export interface BidAccepted {
  bid: { seq: number; amount: Money; source: string; accepted_at: IsoDateTime } | null
  auction: {
    current_price: Money | null
    viewer_is_leader: boolean
    version: number
    ends_at: IsoDateTime
  }
  outbid_by_proxy: boolean
}

export interface CatalogFilters {
  q?: string
  category?: string
  mechanism?: Mechanism | ''
  status?: AuctionStatus | ''
  ending_soon?: boolean
  ordering?: 'ends_at' | '-created_at' | 'current_price'
  page?: number
  mine?: 'owner' | 'participating' | 'watching'
  page_size?: number
}

/** `GET /auctions/{id}/result/` (según audiencia; materializa el cierre si estaba pendiente). */
export interface AuctionResult {
  status: AuctionStatus
  result_pending: boolean
  outcome: 'awarded' | 'unsold' | null
  final_price: Money | null
  bid_count: number | null
  offer_count: number | null
  closed_at: IsoDateTime | null
  cancelled_at: IsoDateTime | null
  /** Solo dueño o ganador. */
  settlement_status: 'pending' | 'completed' | 'failed' | null
  has_reserve: boolean
  reserve_met: boolean | null
  winner_organization?: { id: Uuid; legal_name: string }
  viewer?: { is_owner: boolean; is_winner: boolean; rank?: number | null }
  /** REGLAS §10: con `awarded`, dueño y ganador ven nombre y email del otro. */
  contact?: { display_name: string; email: string }
}

/** `GET|PUT /auctions/{id}/sealed-offer/`: solo la oferta PROPIA (REGLAS §6). */
export interface SealedOfferView {
  amount: Money | null
  submitted_at: IsoDateTime | null
  active_offer_count: number
}

/** `GET /auctions/{id}/bids/` en sobre cerrado tras el cierre: ranking según audiencia. */
export interface SealedRankItem {
  rank: number
  amount: Money
  submitted_at: IsoDateTime
  /** "Postor N" o "Tú". */
  bidder: string
  is_winner: boolean
  /** Solo dueño y staff. */
  bidder_identity?: { id: Uuid; display_name: string }
}
