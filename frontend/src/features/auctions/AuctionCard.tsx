import { Link } from 'react-router'

import { cn } from '@/lib/utils'

import { artFor } from './auctionArt'
import { photoForCategory } from './categoryPhotos'
import { CLOSING_LABEL, MECHANISM_LABEL } from './labels'
import { priceLines } from './PriceSummary'
import { StatusBadge } from './StatusBadge'
import { TimerPill } from './TimerPill'
import type { AuctionSummary } from './types'

function actionLabel(a: AuctionSummary): string {
  if (a.status === 'closed' || a.status === 'cancelled') return 'Ver resultado'
  if (a.status !== 'active') return 'Ver detalles'
  if (a.mechanism === 'sealed') return 'Ofertar'
  if (a.mechanism === 'reverse') return 'Ver sala'
  return 'Pujar ahora'
}

export function AuctionCard({ auction, to }: { auction: AuctionSummary; to?: string }) {
  const price = priceLines(auction)
  const art = artFor(auction)
  const lot = auction.id.replace(/-/g, '').slice(0, 6).toUpperCase()
  const live = auction.status === 'active'
  const timed = live || auction.status === 'scheduled'

  return (
    <li className="group">
      <Link
        to={to ?? `/subastas/${auction.id}`}
        className={cn(
          'flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-card',
          'transition-all duration-300 hover:-translate-y-1 hover:border-primary/60 hover:shadow-xl hover:shadow-primary/15',
          'focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none',
        )}
      >
        {/* Foto ilustrativa de la categoría (el catálogo no trae fotos); el degradado queda de fondo mientras carga */}
        <div
          className={cn(
            'relative m-2 mb-0 aspect-[4/3] overflow-hidden rounded-xl bg-gradient-to-br',
            art.bg,
          )}
        >
          <img
            src={photoForCategory(
              auction.category?.name ?? (auction.mechanism === 'reverse' ? 'insumos' : null),
              600,
            )}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/55"
          />

          <div className="absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
            <StatusBadge status={auction.status} resultPending={auction.result_pending} />
            {timed && (
              <TimerPill
                target={live ? auction.ends_at : auction.starts_at}
                prefix={live ? 'Termina en' : 'Empieza en'}
                elapsedLabel={live ? 'Cerrando…' : 'Empezando…'}
              />
            )}
          </div>
          <span className="absolute bottom-2.5 left-2.5 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white/85 backdrop-blur">
            Lote #{lot}
          </span>
          <span className="absolute right-2.5 bottom-2.5 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white/85 backdrop-blur">
            {MECHANISM_LABEL[auction.mechanism]}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="space-y-1">
            <h2 className="line-clamp-2 leading-snug font-bold text-white">
              {auction.title ?? 'Sin título'}
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {[auction.category?.name, CLOSING_LABEL[auction.closing_policy]]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>

          {!!auction.registrations_pending && (
            <p className="text-xs font-semibold text-link">
              {auction.registrations_pending}{' '}
              {auction.registrations_pending === 1
                ? 'inscripción por revisar'
                : 'inscripciones por revisar'}
            </p>
          )}

          <div className="mt-auto space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">{price.label}</p>
              <p className="text-xl leading-tight font-extrabold text-link tabular-nums">
                {price.value}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  'rounded-lg px-3.5 py-2 text-xs font-bold transition-colors',
                  live
                    ? 'bg-primary text-white group-hover:bg-[#1f66ff]'
                    : 'border border-white/15 text-white group-hover:border-primary/60',
                )}
              >
                {actionLabel(auction)}
              </span>
              {price.detail && (
                <span className="text-xs text-muted-foreground">{price.detail}</span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </li>
  )
}
