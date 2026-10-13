import { api, apiFetchConditional } from '@/api/client'
import type { Paginated, Uuid } from '@/api/types'

import type {
  AuctionDetail,
  AuctionLive,
  AuctionResult,
  AuctionSummary,
  BidAccepted,
  BidHistoryItem,
  SealedOfferView,
  SealedRankItem,
  CatalogFilters,
} from './types'

export const auctionKeys = {
  catalog: (f: CatalogFilters) => ['auctions', 'catalog', f] as const,
  detail: (id: Uuid) => ['auctions', id, 'detail'] as const,
  live: (id: Uuid) => ['auctions', id, 'live'] as const,
  bids: (id: Uuid) => ['auctions', id, 'bids'] as const,
  result: (id: Uuid) => ['auctions', id, 'result'] as const,
  all: (id: Uuid) => ['auctions', id] as const,
}

const path = (id: Uuid, suffix = '') => `/auctions/${encodeURIComponent(id)}/${suffix}`

export function fetchCatalog(f: CatalogFilters, signal?: AbortSignal) {
  return api.get<Paginated<AuctionSummary>>('/auctions/', {
    signal,
    query: {
      q: f.q?.trim() || undefined,
      category: f.category || undefined,
      mechanism: f.mechanism || undefined,
      status: f.status || undefined,
      ending_soon: f.ending_soon ? 'true' : undefined,
      ordering: f.ordering && f.ordering !== 'ends_at' ? f.ordering : undefined,
      page: f.page && f.page > 1 ? f.page : undefined,
      page_size: f.page_size ?? 12,
      mine: f.mine,
    },
  })
}

export const fetchAuction = (id: Uuid, signal?: AbortSignal) =>
  api.get<AuctionDetail>(path(id), { signal })

export interface LiveSnapshot {
  live: AuctionLive
  etag: string | null
}

/** `live/` con `If-None-Match`: si no hay cambios (304) devuelve el mismo objeto anterior. */
export async function fetchLive(
  id: Uuid,
  previous: LiveSnapshot | undefined,
  signal?: AbortSignal,
): Promise<LiveSnapshot> {
  const res = await apiFetchConditional<AuctionLive>(path(id, 'live/'), {
    signal,
    ifNoneMatch: previous?.etag ?? null,
  })
  if (res.notModified && previous) return previous
  if (res.notModified) return fetchLive(id, undefined, signal)
  return { live: res.data, etag: res.etag }
}

export const fetchBids = (id: Uuid, signal?: AbortSignal) =>
  api.get<Paginated<BidHistoryItem>>(path(id, 'bids/'), { signal, query: { page_size: 20 } })

export const placeBid = (id: Uuid, amount: string, idempotencyKey: string) =>
  api.post<BidAccepted>(path(id, 'bids/'), { amount }, { idempotencyKey })

/** Cuerpo de `POST /auctions/` (personal: ascendente o sobre cerrado). Solo campos del contrato. */
export interface AuctionCreateInput {
  mechanism: 'ascending' | 'sealed'
  closing_policy: 'fixed' | 'soft_close' | 'candle'
  proxy_enabled: boolean
  listing_id: Uuid
  starting_price: string
  min_increment?: string
  reserve_price?: string | null
  starts_at: string
  ends_at: string
  soft_close_window_s?: number
  soft_close_extension_s?: number
  soft_close_max_total_s?: number
  candle_window_s?: number
}

export const createAuction = (input: AuctionCreateInput) =>
  api.post<AuctionDetail>('/auctions/', input)

export const publishAuction = (id: Uuid) => api.post<AuctionDetail>(path(id, 'publish/'))

export const fetchResult = (id: Uuid, signal?: AbortSignal) =>
  api.get<AuctionResult>(path(id, 'result/'), { signal })

/** Dueño: borrador o programada siempre; activa solo sin pujas (REGLAS §9). */
export const cancelAuction = (id: Uuid, reason: string) =>
  api.post<AuctionDetail>(path(id, 'cancel/'), { reason })

// --- Fase 3: puja automática y seguimiento (LX-35) ---------------------------------------

/** Solo el máximo PROPIO (matriz de visibilidad). */
export interface ProxyLimitView {
  max_amount: string | null
  status: 'active' | 'exhausted' | string | null
  is_leader: boolean
}

export type ProxyLimitResult = BidAccepted & ProxyLimitView

export const proxyKey = (id: Uuid) => ['auctions', id, 'proxy'] as const

export const fetchProxyLimit = (id: Uuid, signal?: AbortSignal) =>
  api.get<ProxyLimitView>(path(id, 'proxy-limit/'), { signal })

/** Fijar o SUBIR el máximo (bajarlo o repetirlo → PROXY_LIMIT_DECREASE_NOT_ALLOWED). */
export const setProxyLimit = (id: Uuid, maxAmount: string) =>
  api.put<ProxyLimitResult>(path(id, 'proxy-limit/'), { max_amount: maxAmount })

export const watchAuction = (id: Uuid) => api.put<void>(path(id, 'watch/'))
export const unwatchAuction = (id: Uuid) => api.delete<void>(path(id, 'watch/'))

// --- Fase 4: sobre cerrado (LX-42) --------------------------------------------------------

export const sealedKey = (id: Uuid) => ['auctions', id, 'sealed-offer'] as const

export const fetchSealedOffer = (id: Uuid, signal?: AbortSignal) =>
  api.get<SealedOfferView>(path(id, 'sealed-offer/'), { signal })

/** Crear o REEMPLAZAR la oferta propia (el reemplazo pierde prioridad en empates). */
export const putSealedOffer = (id: Uuid, amount: string, idempotencyKey: string) =>
  api.put<SealedOfferView>(path(id, 'sealed-offer/'), { amount }, { idempotencyKey })

export const withdrawSealedOffer = (id: Uuid) => api.delete<void>(path(id, 'sealed-offer/'))

export const fetchSealedRanking = (id: Uuid, signal?: AbortSignal) =>
  api.get<Paginated<SealedRankItem>>(path(id, 'bids/'), { signal })
