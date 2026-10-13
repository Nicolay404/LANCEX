import { cn } from '@/lib/utils'

/** Marca LANCEX: mazo de subasta propio + logotipo con la "X" en el color de acción. */
export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {/* Ícono con gradiente dorado */}
      <span
        aria-hidden
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-xl shadow-sm',
          inverted
            ? 'bg-white/12 text-white ring-1 ring-white/20'
            : 'bg-gradient-to-br from-primary to-[oklch(0.60_0.16_48)] text-primary-foreground shadow-primary/30',
        )}
        style={!inverted ? { boxShadow: '0 2px 8px oklch(0.68 0.17 52 / 35%)' } : undefined}
      >
        <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="m14 13-7.5 7.5a2.12 2.12 0 0 1-3-3L11 10" strokeLinecap="round" />
          <path d="m16 16 6-6M8 8l6-6M9 7l8 8M21 11l-8-8" strokeLinecap="round" />
        </svg>
      </span>
      {/* Wordmark */}
      <span className={cn('text-xl font-extrabold tracking-tight', inverted ? 'text-white' : '')}>
        LANCE
        <span className={inverted ? 'text-[oklch(0.82_0.18_65)]' : 'text-primary'}>X</span>
      </span>
    </span>
  )
}
