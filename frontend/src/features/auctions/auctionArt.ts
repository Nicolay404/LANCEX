import type { AuctionSummary } from './types'

/** Ilustración propia por modalidad, para cuando no hay fotos (el catálogo no las trae). */
export const ART: Record<string, { bg: string; icon: string }> = {
  ascending: {
    bg: 'from-[oklch(0.5_0.08_140)] via-[oklch(0.6_0.09_135)] to-[oklch(0.8_0.1_120)]',
    icon: 'M14 13l-7.5 7.5a2.12 2.12 0 0 1-3-3L11 10M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8',
  },
  sealed: {
    bg: 'from-[oklch(0.5_0.09_50)] via-[oklch(0.58_0.11_55)] to-[oklch(0.72_0.1_70)]',
    icon: 'M3 7l9 6 9-6M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2',
  },
  candle: {
    bg: 'from-[oklch(0.42_0.06_60)] via-[oklch(0.55_0.12_65)] to-[oklch(0.8_0.12_85)]',
    icon: 'M12 3c1.5 2 2 3 0 5-2-2-1.5-3 0-5zM9 10h6v11H9zM7 21h10',
  },
  reverse: {
    bg: 'from-[oklch(0.36_0.05_200)] via-[oklch(0.48_0.07_190)] to-[oklch(0.72_0.08_160)]',
    icon: 'M7 7h10l-3-3M17 17H7l3 3M4 12h16',
  },
}

export function artFor(a: Pick<AuctionSummary, 'mechanism' | 'closing_policy'>) {
  return ART[a.closing_policy === 'candle' ? 'candle' : a.mechanism] ?? ART.ascending!
}
