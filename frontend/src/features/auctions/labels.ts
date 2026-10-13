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
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  active: 'bg-live text-white',
  closed: 'bg-foreground/85 text-background',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
}

export const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual',
  proxy: 'Automática',
}
