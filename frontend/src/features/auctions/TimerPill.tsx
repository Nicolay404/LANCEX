import { cn } from '@/lib/utils'

import { formatRemaining } from './formatRemaining'
import { splitRemaining, useRemaining } from './useRemaining'

/**
 * Reloj compacto "HH:MM:SS" (o "2d 04:10:05") con la hora del servidor.
 * Los dígitos son decorativos; el texto accesible es "Termina en 2 h 05 min…".
 */
export function TimerPill({
  target,
  prefix,
  elapsedLabel,
  className,
}: {
  target: string | null
  prefix: string
  elapsedLabel: string
  className?: string
}) {
  const remaining = useRemaining(target)
  if (!Number.isFinite(remaining)) return null
  const base = cn(
    'inline-flex items-center rounded-md bg-black/70 px-2 py-0.5 font-mono text-xs font-semibold text-white tabular-nums backdrop-blur',
    className,
  )
  if (remaining <= 0) return <span className={base}>{elapsedLabel}</span>
  const { days, hours, minutes, seconds } = splitRemaining(remaining)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <span className={base}>
      <span className="sr-only">
        {prefix} {formatRemaining(remaining)}
      </span>
      <span aria-hidden>
        {days > 0 && `${days}d `}
        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </span>
    </span>
  )
}
