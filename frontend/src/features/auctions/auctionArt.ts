import type { AuctionSummary } from './types'

/** Ilustración propia por modalidad, para cuando no hay fotos (el catálogo no las trae). */
export const ART: Record<string, { bg: string; icon: string }> = {
  ascending: {
    bg: 'from-[#0a1f5c] via-[#0b2e8a] to-[#1a5cff]',
    icon: 'M14 13l-7.5 7.5a2.12 2.12 0 0 1-3-3L11 10M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8',
  },
  sealed: {
    bg: 'from-[#141414] via-[#1d2433] to-[#2b3d66]',
    icon: 'M3 7l9 6 9-6M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2',
  },
  candle: {
    bg: 'from-[#0d0d0d] via-[#1a2140] to-[#3651a8]',
    icon: 'M12 3c1.5 2 2 3 0 5-2-2-1.5-3 0-5zM9 10h6v11H9zM7 21h10',
  },
  reverse: {
    bg: 'from-[#081428] via-[#0c2a4d] to-[#14619e]',
    icon: 'M7 7h10l-3-3M17 17H7l3 3M4 12h16',
  },
}

export function artFor(a: Pick<AuctionSummary, 'mechanism' | 'closing_policy'>) {
  return ART[a.closing_policy === 'candle' ? 'candle' : a.mechanism] ?? ART.ascending!
}
