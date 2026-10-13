import { Link } from 'react-router'

import { Countdown } from './Countdown'
import { CLOSING_LABEL, MECHANISM_LABEL } from './labels'
import { priceLines } from './PriceSummary'
import { StatusBadge } from './StatusBadge'
import type { AuctionSummary } from './types'

export function AuctionCard({ auction, to }: { auction: AuctionSummary; to?: string }) {
  const price = priceLines(auction)
  return (
    <li>
      <Link
        to={to ?? `/subastas/${auction.id}`}
        className="flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-foreground/30"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="line-clamp-2 font-medium">{auction.title ?? 'Sin título'}</h2>
          <StatusBadge status={auction.status} resultPending={auction.result_pending} />
        </div>
        <p className="text-xs text-muted-foreground">
          {[
            auction.category?.name,
            MECHANISM_LABEL[auction.mechanism],
            CLOSING_LABEL[auction.closing_policy],
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className="mt-auto flex items-end justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">{price.label}</p>
            <p className="text-lg font-semibold tabular-nums">{price.value}</p>
            {price.detail && <p className="text-xs text-muted-foreground">{price.detail}</p>}
          </div>
          <p className="text-right text-xs text-muted-foreground tabular-nums">
            {auction.status === 'active' && (
              <Countdown target={auction.ends_at} prefix="Termina en" elapsedLabel="Cerrando…" />
            )}
            {auction.status === 'scheduled' && (
              <Countdown target={auction.starts_at} prefix="Empieza en" elapsedLabel="Empezando…" />
            )}
          </p>
        </div>
      </Link>
    </li>
  )
}
