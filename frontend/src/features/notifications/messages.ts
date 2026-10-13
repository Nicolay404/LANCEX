import { formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

import type { AppNotification } from './api'

const REPORT_TARGET: Record<string, string> = {
  auction: 'una subasta',
  listing: 'una publicación',
  user: 'un usuario',
}

/** Texto de cada tipo (`notifications/services.TYPES`). Tipos nuevos caen en un texto genérico. */
export function notificationText(n: AppNotification): string {
  const d = n.data ?? {}
  const title = d.title ? `«${d.title}»` : 'una subasta'
  switch (n.type) {
    case 'outbid':
      return `Te superaron en ${title}. Precio actual: ${formatMoney(d.current_price)}.`
    case 'auction_won':
      return `¡Ganaste ${title}! Precio final: ${formatMoney(d.final_price)}.`
    case 'auction_lost':
      return `Terminó ${title} y esta vez no ganaste.`
    case 'auction_closed_owner':
      return `Tu subasta ${title} se vendió por ${formatMoney(d.final_price)}.`
    case 'auction_unsold_owner':
      return `Tu subasta ${title} terminó sin venta.`
    case 'auction_cancelled':
      return `Se canceló ${title}.${d.reason ? ` Motivo: ${d.reason}` : ''}`
    case 'participant_admitted':
      return `Tu organización fue admitida en ${title}.`
    case 'participant_rejected':
      return `Tu organización no fue admitida en ${title}.${d.reason ? ` Motivo: ${d.reason}` : ''}`
    case 'watch_auction_started':
      return `Empezó ${title}, que estás siguiendo.`
    case 'watch_auction_ending':
      return `${title[0]!.toUpperCase()}${title.slice(1)}, que sigues, termina pronto${d.ends_at ? ` (${formatDateTime(d.ends_at)})` : ''}.`
    case 'organization_verified':
      return `La organización${d.organization_name ? ` «${d.organization_name}»` : ''} fue verificada.`
    case 'organization_rejected':
      return `No se verificó la organización${d.organization_name ? ` «${d.organization_name}»` : ''}.${d.reason ? ` Motivo: ${d.reason}` : ''}`
    case 'report_resolved':
      return `Revisamos tu reporte${d.target_type ? ` de ${REPORT_TARGET[d.target_type] ?? 'contenido'}` : ''}. Gracias por avisarnos.`
    case 'rating_received':
      return `Recibiste una calificación por ${title}.`
    default:
      return 'Tienes una novedad en LANCEX.'
  }
}

const RESULT_TYPES = new Set([
  'auction_won',
  'auction_lost',
  'auction_closed_owner',
  'auction_unsold_owner',
  'auction_cancelled',
])

export function notificationLink(n: AppNotification): string | null {
  if (!n.auction_id) return null
  return RESULT_TYPES.has(n.type)
    ? `/subastas/${n.auction_id}/resultado`
    : `/subastas/${n.auction_id}`
}
