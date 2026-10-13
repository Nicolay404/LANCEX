import { serverNow } from '@/lib/serverClock'

import type { AuctionStatus, CandleInfo } from './types'

/** ¿Está la subasta en la ventana de vela según la hora del SERVIDOR? */
export function inCandleWindow(
  candle: CandleInfo | null,
  status: AuctionStatus,
  now = serverNow(),
): boolean {
  return !!candle && status === 'active' && now >= Date.parse(candle.window_start)
}
