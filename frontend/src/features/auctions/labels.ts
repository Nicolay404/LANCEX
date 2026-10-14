import type { AuctionStatus, ClosingPolicy, Mechanism } from './types'

export const MECHANISM_LABEL: Record<Mechanism, string> = {
  ascending: 'Ascendente',
  sealed: 'Sobre cerrado',
  reverse: 'Inversa (B2B)',
}

export const CLOSING_LABEL: Record<ClosingPolicy, string> = {
  fixed: 'Cierre fijo',
  soft_close: 'Cierre con extensión',
  candle: 'Cierre por vela',
}

export const STATUS_LABEL: Record<AuctionStatus, string> = {
  draft: 'Borrador',
  scheduled: 'Programada',
  active: 'Activa',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
}

export const STATUS_TONE: Record<AuctionStatus, string> = {
  draft: 'bg-white/10 text-white/80',
  scheduled: 'bg-primary/90 text-white',
  active: 'bg-live text-white',
  closed: 'bg-white/15 text-white',
  cancelled: 'bg-red-950 text-red-200',
}

export const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual',
  proxy: 'Automática',
}
