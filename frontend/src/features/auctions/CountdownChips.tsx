import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

import { formatRemaining } from './formatRemaining'
import { splitRemaining, useRemaining } from './useRemaining'

/**
 * Cuenta regresiva en "fichas" (días · horas · min · seg) con la hora del servidor.
 * El texto accesible es el mismo que el de `Countdown` ("Termina en 2 h 05 min…").
 */
export function CountdownChips({
  target,
  prefix,
  elapsedLabel,
  className,
  size = 'sm',
  surface = 'overlay',
  onElapsed,
}: {
  /** Se llama una vez al llegar a cero (p. ej. para refrescar `live/`). */
  onElapsed?: () => void
  target: string | null
  prefix: string
  elapsedLabel: string
  className?: string
  size?: 'sm' | 'lg'
  /** `overlay`: fichas blancas sobre una imagen; `plain`: sobre una tarjeta. */
  surface?: 'overlay' | 'plain'
}) {
  const remaining = useRemaining(target)
  const elapsed = Number.isFinite(remaining) && remaining <= 0
  const fired = useRef<string | null>(null)
  useEffect(() => {
    if (elapsed && target && fired.current !== target) {
      fired.current = target
      onElapsed?.()
    }
  }, [elapsed, target, onElapsed])
  if (!Number.isFinite(remaining)) return null
  if (remaining <= 0) {
    return <span className={cn('text-sm font-semibold', className)}>{elapsedLabel}</span>
  }
  const { days, hours, minutes, seconds } = splitRemaining(remaining)
  const parts: [number, string][] = [
    [days, 'Días'],
    [hours, 'Horas'],
    [minutes, 'Min'],
    [seconds, 'Seg'],
  ]
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className={cn('font-medium', size === 'lg' ? 'text-sm' : 'text-[11px]')}>
        {prefix}
        <span className="sr-only"> {formatRemaining(remaining)}</span>
      </span>
      <div aria-hidden className="flex gap-1.5">
        {parts.map(([value, label]) => (
          <span
            key={label}
            className={cn(
              'flex flex-col items-center rounded-lg',
              surface === 'overlay'
                ? 'bg-card/95 text-card-foreground shadow-sm'
                : 'bg-secondary text-secondary-foreground',
              size === 'lg' ? 'min-w-14 px-2 py-1.5' : 'min-w-10 px-1.5 py-1',
            )}
          >
            <span
              className={cn(
                'font-bold tabular-nums leading-none',
                size === 'lg' ? 'text-2xl' : 'text-sm',
              )}
            >
              {String(value).padStart(2, '0')}
            </span>
            <span
              className={cn(
                'mt-0.5 text-muted-foreground',
                size === 'lg' ? 'text-[11px]' : 'text-[9px]',
              )}
            >
              {label}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
