import { Link } from 'react-router'

import { useServerNow } from '@/lib/serverClock'

import { inCandleWindow } from './candleWindow'

import { Countdown } from './Countdown'
import type { AuctionStatus, CandleInfo } from './types'

/**
 * Indicador de cierre por vela (REGLAS §5, LX-62): antes de la ventana, cuánto falta; dentro de
 * ella, aviso de que la subasta pudo haber terminado ya y el precio es provisional; al cerrar,
 * enlace a la verificación. Siempre muestra el compromiso publicado.
 */
export function CandlePhase({
  auctionId,
  candle,
  status,
}: {
  auctionId: string
  candle: CandleInfo
  status: AuctionStatus
}) {
  const now = useServerNow()
  const inWindow = inCandleWindow(candle, status, now)
  const minutes = Math.round(candle.window_s / 60)

  return (
    <div className="space-y-2 text-sm">
      {status === 'active' && !inWindow && (
        <p className="text-muted-foreground">
          Fase normal. La <span className="font-medium text-foreground">vela</span> se enciende en{' '}
          <Countdown target={candle.window_start} prefix="" elapsedLabel="un instante" />: desde ahí
          la subasta puede terminar en cualquier momento de los últimos {minutes} min.
        </p>
      )}
      {inWindow && (
        <div
          role="status"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200"
        >
          <p className="font-medium">🕯️ Fase de vela</p>
          <p className="text-xs">
            {candle.notice ??
              'La subasta pudo haber terminado ya: el instante real se revela al cierre.'}{' '}
            Las pujas posteriores a ese instante no contarán.
          </p>
        </div>
      )}
      {status === 'closed' && (
        <Link
          to={`/subastas/${auctionId}/verificar-vela`}
          className="inline-block text-sm underline underline-offset-4"
        >
          Verificar el cierre por vela
        </Link>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Compromiso publicado</summary>
        <p className="mt-1">
          Huella SHA-256 de la semilla secreta, publicada al iniciar. Al cierre se revela la semilla
          para que cualquiera compruebe que el instante no se eligió después.
        </p>
        <code className="mt-1 block break-all">{candle.commitment}</code>
      </details>
    </div>
  )
}

/** Marca "precio provisional" que se activa sola al entrar en la ventana (re-render cada segundo). */
export function ProvisionalPriceNote({
  candle,
  status,
}: {
  candle: CandleInfo | null
  status: AuctionStatus
}) {
  const now = useServerNow()
  if (!inCandleWindow(candle, status, now)) return null
  return <p className="text-xs text-amber-700">Precio provisional (fase de vela)</p>
}
