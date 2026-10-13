import { api } from '@/api/client'
import type { Paginated, Uuid } from '@/api/types'
import type { AuctionDetail, BidAccepted } from '@/features/auctions/types'

import type {
  ComplianceItem,
  Opportunity,
  Participant,
  ProcurementInput,
  ProcurementRequest,
  Registration,
  ReverseAuctionInput,
} from './types'

const auctionPath = (id: Uuid, rest = '') => `/auctions/${encodeURIComponent(id)}/${rest}`

const orgPath = (id: Uuid, rest: string) => `/organizations/${encodeURIComponent(id)}/${rest}`

export const reverseKeys = {
  procurement: (id: Uuid) => ['procurement-requests', id] as const,
  orgNeeds: (orgId: Uuid, page: number) => ['organizations', orgId, 'needs', page] as const,
  opportunities: (orgId: Uuid) => ['organizations', orgId, 'opportunities'] as const,
  registrations: (orgId: Uuid) => ['organizations', orgId, 'registrations'] as const,
  participants: (auctionId: Uuid) => ['auctions', auctionId, 'participants'] as const,
}

export const createProcurementRequest = (input: ProcurementInput) =>
  api.post<ProcurementRequest>('/procurement-requests/', input)

export const fetchProcurementRequest = (id: Uuid, signal?: AbortSignal) =>
  api.get<ProcurementRequest>(`/procurement-requests/${encodeURIComponent(id)}/`, { signal })

/** Necesidades de mi organización compradora (paginado), cada una con su `auction`. */
export const fetchOrganizationNeeds = (orgId: Uuid, page: number, signal?: AbortSignal) =>
  api.get<Paginated<ProcurementRequest>>(orgPath(orgId, 'procurement-requests/'), {
    signal,
    query: { page: page > 1 ? page : undefined, page_size: 20 },
  })

export const fetchOpportunities = (orgId: Uuid, signal?: AbortSignal) =>
  api.get<{ results: Opportunity[] }>(orgPath(orgId, 'opportunities/'), { signal })

export const fetchRegistrations = (orgId: Uuid, signal?: AbortSignal) =>
  api.get<{ results: Registration[] }>(orgPath(orgId, 'registrations/'), { signal })

export const createReverseAuction = (input: ReverseAuctionInput) =>
  api.post<AuctionDetail>('/auctions/', input)

/** Compradora: todas las inscripciones. Proveedor: solo las de sus organizaciones. */
export const fetchParticipants = (auctionId: Uuid, signal?: AbortSignal) =>
  api.get<{ results: Participant[] }>(auctionPath(auctionId, 'participants/'), { signal })

export const registerParticipant = (
  auctionId: Uuid,
  organizationId: Uuid,
  compliance: ComplianceItem[],
) =>
  api.post<Participant>(auctionPath(auctionId, 'participants/'), {
    organization_id: organizationId,
    compliance,
  })

export const decideParticipant = (
  auctionId: Uuid,
  participantId: Uuid,
  status: 'admitted' | 'rejected',
  reason: string,
) =>
  api.post<Participant>(
    auctionPath(auctionId, `participants/${encodeURIComponent(participantId)}/decision/`),
    status === 'rejected' ? { status, reason } : { status },
  )

/** Oferta inversa: el servidor calcula el total. Una `Idempotency-Key` por intento lógico. */
export const placeReverseOffer = (
  auctionId: Uuid,
  body: { unit_price: string; shipping_cost: string; organization_id?: Uuid },
  idempotencyKey: string,
) => api.post<BidAccepted>(auctionPath(auctionId, 'bids/'), body, { idempotencyKey })

export interface ReverseQuote {
  total: string
  maximum_allowed: string
  within_maximum: boolean
  formula: string
}

/** Total oficial calculado por el servidor, sin crear oferta (`POST /auctions/{id}/reverse-quote/`). */
export const quoteReverseOffer = (
  auctionId: Uuid,
  body: { unit_price: string; shipping_cost: string },
) => api.post<ReverseQuote>(auctionPath(auctionId, 'reverse-quote/'), body)
