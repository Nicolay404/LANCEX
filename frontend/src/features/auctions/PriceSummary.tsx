import { formatMoney } from '@/lib/money'

import type { AuctionSummary } from './types'

type PriceFields = Pick<
  AuctionSummary,
  | 'mechanism'
  | 'status'
  | 'current_price'
  | 'minimum_next_bid'
  | 'maximum_allowed'
  | 'bid_count'
  | 'active_offer_count'
>

/**
 * Precio y contadores según la modalidad (matriz de visibilidad):
 * en sobre cerrado nunca hay precio antes del cierre, solo el número de ofertas.
 */
export function priceLines(a: PriceFields): { label: string; value: string; detail?: string } {
  if (a.mechanism === 'sealed') {
    if (a.current_price) return { label: 'Precio final', value: formatMoney(a.current_price) }
    const n = a.active_offer_count ?? 0
    return { label: 'Ofertas selladas', value: `${n} ${n === 1 ? 'oferta' : 'ofertas'}` }
  }
  const count = a.bid_count ?? 0
  const detail = `${count} ${a.mechanism === 'reverse' ? (count === 1 ? 'oferta' : 'ofertas') : count === 1 ? 'puja' : 'pujas'}`
  if (a.mechanism === 'reverse') {
    if (a.current_price)
      return { label: 'Mejor oferta', value: formatMoney(a.current_price), detail }
    return { label: 'Presupuesto máximo', value: formatMoney(a.maximum_allowed), detail }
  }
  if (a.current_price) {
    return {
      label: a.status === 'closed' ? 'Precio final' : 'Precio actual',
      value: formatMoney(a.current_price),
      detail,
    }
  }
  return { label: 'Precio base', value: formatMoney(a.minimum_next_bid), detail }
}
