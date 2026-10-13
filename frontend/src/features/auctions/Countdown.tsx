import { useEffect, useRef, useState } from 'react'

import { useServerOffset } from '@/lib/serverClock'

import { formatRemaining } from './formatRemaining'

/**
 * Cuenta regresiva con la hora del SERVIDOR (desfase de `server_time`), nunca con el reloj
 * local a secas: si la laptop está adelantada, igual muestra el tiempo real que queda.
 */
export function Countdown({
  target,
  prefix,
  elapsedLabel,
  onElapsed,
  className,
}: {
  target: string | null
  prefix: string
  elapsedLabel: string
  onElapsed?: () => void
  className?: string
}) {
  const offset = useServerOffset()
  const [now, setNow] = useState(() => Date.now())
  const fired = useRef<string | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const targetMs = target ? Date.parse(target) : NaN
  const remaining = targetMs - (now + offset)
  const elapsed = Number.isFinite(remaining) && remaining <= 0

  useEffect(() => {
    if (elapsed && target && fired.current !== target) {
      fired.current = target
      onElapsed?.()
    }
  }, [elapsed, target, onElapsed])

  if (!Number.isFinite(remaining)) return null
  return (
    <span className={className} aria-live="off">
      {elapsed ? elapsedLabel : `${prefix} ${formatRemaining(remaining)}`}
    </span>
  )
}
