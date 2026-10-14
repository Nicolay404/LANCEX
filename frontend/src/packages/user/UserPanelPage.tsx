import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Button } from '@/components/ui/button'
import { auctionKeys, fetchCatalog } from '@/features/auctions/api'
import { AuctionCard } from '@/features/auctions/AuctionCard'
import type { CatalogFilters } from '@/features/auctions/types'
import { Cap, hasCapability } from '@/features/auth/capabilities'
import { useMe } from '@/features/auth/session'
import { fetchSummary, meKeys } from '@/features/me/api'
import type { MySummary } from '@/features/me/types'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

/** Trazos de iconos (24×24, estilo línea). */
const ICON = {
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  trendUp: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  trendDown: 'M3 7l6 6 4-4 8 8M15 17h6v-6',
  mail: 'M3 7l9 6 9-6M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2',
  gavel: 'M14 13l-7.5 7.5a2.12 2.12 0 0 1-3-3L11 10M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8',
  draft: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  live: 'M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  wallet: 'M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4z',
  info: 'M12 16v-4M12 8h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
} as const

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={cn('size-5', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

/** `/panel` (paquete `user`, capacidad `bid.place`): resumen personal (`GET /me/summary/`). */
export default function UserPanelPage() {
  const me = useMe()
  const summary = useQuery({
    queryKey: meKeys.summary,
    queryFn: ({ signal }) => fetchSummary(signal),
    refetchInterval: 30_000,
  })
  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            Panel personal
          </p>
          <h1 className="text-3xl font-extrabold text-white sm:text-4xl">
            Mi <span className="accent-word">actividad</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Tus pujas, tus subastas y tus operaciones en un solo lugar. Se actualiza solo.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="light">
            <Link to="/mis-pujas">Mis pujas</Link>
          </Button>
          {hasCapability(me, Cap.AUCTION_MANAGE_OWN) && (
            <Button asChild variant="light">
              <Link to="/mis-subastas">Mis subastas</Link>
            </Button>
          )}
        </div>
      </header>

      {summary.isPending ? (
        <PageLoading />
      ) : summary.isError ? (
        <ErrorAlert error={summary.error} title="No se pudo cargar tu resumen" />
      ) : (
        <SummaryView s={summary.data} />
      )}

      {hasCapability(me, Cap.WATCHLIST_MANAGE_OWN) && (
        <Section
          id="watching"
          eyebrow="Seguimiento"
          title="Subastas que sigo"
          to="/seguimiento"
          filters={{ mine: 'watching', status: 'active', page_size: 4 }}
          empty={
            <>
              Marca "Seguir subasta" en cualquier subasta para verla aquí.{' '}
              <Link to="/?status=active" className="font-semibold text-link hover:text-white">
                Explorar subastas en vivo
              </Link>
            </>
          }
        />
      )}
      {hasCapability(me, Cap.AUCTION_MANAGE_OWN) && (
        <Section
          id="mine-active"
          eyebrow="Vendiendo"
          title="Mis subastas en vivo"
          to="/mis-subastas?estado=active"
          filters={{ mine: 'owner', status: 'active', page_size: 4 }}
          empty={
            <>
              Ninguna de tus subastas está en vivo ahora; las programadas están en{' '}
              <Link to="/mis-subastas" className="font-semibold text-link hover:text-white">
                Mis subastas
              </Link>
              .{' '}
              {hasCapability(me, Cap.AUCTION_CREATE_PERSONAL) && (
                <Link to="/mis-subastas/nueva" className="font-semibold text-link hover:text-white">
                  Crear una subasta
                </Link>
              )}
            </>
          }
        />
      )}
    </div>
  )
}

function SummaryView({ s }: { s: MySummary }) {
  const p = s.participations
  const m = s.my_auctions
  const o = s.operations
  return (
    <div className="space-y-6">
      {s.unread_notifications > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-primary/40 bg-primary/10 px-5 py-4">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary text-white">
            <Icon d={ICON.bell} />
          </span>
          <p className="flex-1 text-sm text-white">
            Tienes{' '}
            <Link
              to="/notificaciones"
              className="font-bold text-link underline-offset-4 hover:underline"
            >
              {s.unread_notifications}{' '}
              {s.unread_notifications === 1 ? 'notificación sin leer' : 'notificaciones sin leer'}
            </Link>
            . Revisa si te superaron o si terminó alguna subasta.
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Group id="sum-part" icon={ICON.gavel} title="Mis pujas" to="/mis-pujas">
          <Tile
            label="Vas ganando"
            value={p.leading}
            to="/mis-pujas"
            icon={ICON.trendUp}
            tone="emerald"
          />
          <Tile
            label="Te superaron"
            value={p.outbid}
            to="/mis-pujas"
            icon={ICON.trendDown}
            tone="red"
          />
          <Tile
            label="Ofertas selladas"
            value={p.sealed_offers}
            to="/mis-pujas"
            icon={ICON.mail}
            tone="blue"
          />
          <Tile
            label="Ganadas"
            value={p.won}
            to="/mis-pujas?tab=won"
            icon={ICON.trophy}
            tone="amber"
          />
        </Group>
        <Group id="sum-own" icon={ICON.live} title="Mis subastas" to="/mis-subastas">
          <Tile
            label="Borradores"
            value={m.draft}
            to="/mis-subastas?estado=draft"
            icon={ICON.draft}
            tone="slate"
          />
          <Tile
            label="Programadas o activas"
            value={m.scheduled_or_active}
            to="/mis-subastas?estado=active"
            icon={ICON.live}
            tone="blue"
          />
          <Tile
            label="Vendidas"
            value={m.sold}
            to="/mis-subastas?estado=closed"
            icon={ICON.check}
            tone="emerald"
          />
          <Tile
            label="Sin venta"
            value={m.unsold}
            to="/mis-subastas?estado=closed"
            icon={ICON.x}
            tone="slate"
          />
        </Group>
      </div>

      <section
        aria-labelledby="sum-ops"
        className="space-y-5 rounded-3xl border border-white/[0.08] bg-card p-6 sm:p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="sum-ops" className="flex items-center gap-3 text-xl font-bold text-white">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/15 text-link ring-1 ring-primary/40">
              <Icon d={ICON.wallet} />
            </span>
            Resumen de operaciones
          </h2>
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold',
              o.pending_settlements > 0
                ? 'bg-amber-500/15 text-amber-300'
                : 'bg-emerald-500/15 text-emerald-300',
            )}
          >
            {o.pending_settlements > 0
              ? `${o.pending_settlements} ${o.pending_settlements === 1 ? 'liquidación pendiente' : 'liquidaciones pendientes'}`
              : 'Sin liquidaciones pendientes'}
          </span>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Money label="Comprado (adjudicado)" value={o.bought_total} />
          <Money label="Vendido (adjudicado)" value={o.sold_total} />
          <Money label="Liquidado como comprador" value={o.settled_as_buyer} />
          <Money label="Liquidado como vendedor" value={o.settled_as_seller} />
        </dl>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Icon d={ICON.info} className="mt-px size-4 shrink-0" />
          {o.notice}
        </p>
      </section>
    </div>
  )
}

function Group({
  id,
  icon,
  title,
  to,
  children,
}: {
  id: string
  icon: string
  title: string
  to: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className="space-y-4 rounded-3xl border border-white/[0.08] bg-card p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="flex items-center gap-3 text-xl font-bold text-white">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/15 text-link ring-1 ring-primary/40">
            <Icon d={icon} />
          </span>
          {title}
        </h2>
        <Link to={to} className="text-sm font-semibold text-link hover:text-white">
          Ver todo →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </section>
  )
}

const TONES = {
  emerald: { text: 'text-emerald-300', chip: 'bg-emerald-500/15 text-emerald-300' },
  red: { text: 'text-red-300', chip: 'bg-red-500/15 text-red-300' },
  blue: { text: 'text-link', chip: 'bg-primary/20 text-link' },
  amber: { text: 'text-amber-300', chip: 'bg-amber-500/15 text-amber-300' },
  slate: { text: 'text-white', chip: 'bg-white/10 text-white/70' },
} as const

function Tile({
  label,
  value,
  to,
  icon,
  tone,
}: {
  label: string
  value: number
  to: string
  icon: string
  tone: keyof typeof TONES
}) {
  const t = TONES[tone]
  return (
    <Link
      to={to}
      aria-label={`${label}: ${value}`}
      className="group flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-background/60 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/50"
    >
      <span
        className={cn(
          'inline-flex size-11 shrink-0 items-center justify-center rounded-xl',
          t.chip,
        )}
      >
        <Icon d={icon} />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block text-3xl leading-none font-extrabold tabular-nums',
            value > 0 ? t.text : 'text-white/35',
          )}
        >
          {value}
        </span>
        <span className="mt-1 block truncate text-sm text-muted-foreground">{label}</span>
      </span>
    </Link>
  )
}

function Money({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-background/60 p-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 text-2xl font-extrabold text-white tabular-nums">
        {formatMoney(value)}
      </dd>
    </div>
  )
}

function Section({
  id,
  eyebrow,
  title,
  to,
  filters,
  empty,
}: {
  id: string
  eyebrow: string
  title: string
  to: string
  filters: CatalogFilters
  empty: ReactNode
}) {
  const q = useQuery({
    queryKey: auctionKeys.catalog(filters),
    queryFn: ({ signal }) => fetchCatalog(filters, signal),
    refetchInterval: 15_000,
  })
  return (
    <section aria-labelledby={id} className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            {eyebrow}
          </p>
          <h2 id={id} className="text-2xl font-extrabold text-white">
            {title}
          </h2>
        </div>
        <Link to={to} className="text-sm font-semibold text-link hover:text-white">
          Ver todo →
        </Link>
      </div>
      {q.data && q.data.results.length > 0 ? (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {q.data.results.map((a) => (
            <AuctionCard key={a.id} auction={a} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-white/10 bg-card/50 p-8 text-center text-sm text-muted-foreground">
          {q.isPending ? 'Cargando…' : empty}
        </p>
      )}
    </section>
  )
}
