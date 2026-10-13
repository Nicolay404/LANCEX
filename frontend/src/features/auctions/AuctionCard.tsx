import { Link } from 'react-router'

import { cn } from '@/lib/utils'

import { artFor } from './auctionArt'
import { CountdownChips } from './CountdownChips'
import { CLOSING_LABEL, MECHANISM_LABEL } from './labels'
import { priceLines } from './PriceSummary'
import { StatusBadge } from './StatusBadge'
import type { AuctionSummary } from './types'

function actionLabel(a: AuctionSummary): string {
  if (a.status === 'closed' || a.status === 'cancelled') return 'Ver resultado'
  if (a.status !== 'active') return 'Ver detalles'
  if (a.mechanism === 'sealed') return 'Ofertar'
  if (a.mechanism === 'reverse') return 'Ver sala'
  return 'Pujar ahora'
}

function actionColor(a: AuctionSummary): string {
  if (a.status === 'active') {
    if (a.mechanism === 'sealed') return 'from-purple-600 to-purple-700'
    if (a.mechanism === 'reverse') return 'from-sky-600 to-sky-700'
    return 'from-primary to-[oklch(0.60_0.16_50)]'
  }
  return 'from-foreground/80 to-foreground/90'
}

export function AuctionCard({ auction, to }: { auction: AuctionSummary; to?: string }) {
  const price = priceLines(auction)
  const art = artFor(auction)
  const lot = auction.id.replace(/-/g, '').slice(0, 6).toUpperCase()
  const isActive = auction.status === 'active'

  return (
    <li className="group">
      <Link
        to={to ?? `/subastas/${auction.id}`}
        className={cn(
          'flex h-full flex-col overflow-hidden rounded-2xl border bg-card',
          'shadow-sm transition-all duration-300',
          'hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10',
          'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
          // Borde dorado sutil en activas
          isActive && 'border-primary/20 hover:border-primary/40',
        )}
      >
        {/* Imagen / arte superior */}
        <div className={cn('relative aspect-[4/3] bg-gradient-to-br overflow-hidden', art.bg)}>
          {/* Fondo con grid sutil */}
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: `
                linear-gradient(oklch(1 0 0) 1px, transparent 1px),
                linear-gradient(90deg, oklch(1 0 0) 1px, transparent 1px)
              `,
              backgroundSize: '24px 24px',
            }}
          />

          {/* Ícono central con transición */}
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="absolute top-1/2 left-1/2 size-24 -translate-x-1/2 -translate-y-[58%] text-white/30 transition-all duration-500 group-hover:scale-110 group-hover:text-white/45"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={art.icon} />
          </svg>

          {/* Gradiente inferior */}
          <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />

          {/* Badges superiores */}
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
            <StatusBadge status={auction.status} resultPending={auction.result_pending} />
            <span className="rounded-full border border-white/20 bg-black/40 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur">
              #{lot}
            </span>
          </div>

          {/* Mecanismo badge (esquina derecha) */}
          <span className="absolute top-3 right-3 rounded-full border border-white/15 bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white/80 backdrop-blur">
            {MECHANISM_LABEL[auction.mechanism]}
          </span>

          {/* Countdown */}
          {(auction.status === 'active' || auction.status === 'scheduled') && (
            <div className="absolute inset-x-0 bottom-0 px-3 pb-3">
              <CountdownChips
                target={auction.status === 'active' ? auction.ends_at : auction.starts_at}
                prefix={auction.status === 'active' ? 'Termina en' : 'Empieza en'}
                elapsedLabel={auction.status === 'active' ? 'Cerrando…' : 'Empezando…'}
                className="items-center"
              />
            </div>
          )}
        </div>

        {/* Contenido de la tarjeta */}
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="space-y-1">
            <h2 className="line-clamp-2 font-semibold leading-snug">{auction.title ?? 'Sin título'}</h2>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {auction.category?.name && (
                <>
                  <span className="inline-block max-w-[80px] truncate">{auction.category.name}</span>
                  <span className="opacity-40">·</span>
                </>
              )}
              <span>{CLOSING_LABEL[auction.closing_policy]}</span>
            </p>
          </div>

          {!!auction.registrations_pending && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <span aria-hidden className="size-1.5 rounded-full bg-primary animate-pulse" />
              {auction.registrations_pending}{' '}
              {auction.registrations_pending === 1 ? 'inscripción por revisar' : 'inscripciones por revisar'}
            </p>
          )}

          {/* Precio + CTA */}
          <div className="mt-auto flex items-end justify-between gap-2 border-t border-border/60 pt-3">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {price.label}
              </p>
              <p className="text-xl font-bold tabular-nums leading-tight">{price.value}</p>
              {price.detail && (
                <p className="text-[11px] text-muted-foreground">{price.detail}</p>
              )}
            </div>
            <span
              className={cn(
                'shrink-0 rounded-xl bg-gradient-to-br px-3.5 py-1.5 text-xs font-bold text-white',
                'shadow-sm transition-all duration-200',
                'group-hover:shadow-md group-hover:-translate-y-0.5',
                actionColor(auction),
              )}
            >
              {actionLabel(auction)}
            </span>
          </div>
        </div>
      </Link>
    </li>
  )
}
