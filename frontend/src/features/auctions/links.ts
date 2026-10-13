import type { AuctionSummary } from './types'

/** Cerradas o canceladas van directo a su resultado. */
export const resultLinkIfFinished = (a: Pick<AuctionSummary, 'id' | 'status'>) =>
  a.status === 'closed' || a.status === 'cancelled' ? `/subastas/${a.id}/resultado` : undefined
