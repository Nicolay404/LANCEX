import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { auctionKeys, fetchCatalog } from '@/features/auctions/api'
import { AuctionCard } from '@/features/auctions/AuctionCard'
import type { CatalogFilters } from '@/features/auctions/types'
import { Cap, hasCapability } from '@/features/auth/capabilities'
import { useMe } from '@/features/auth/session'
import { fetchSummary, meKeys } from '@/features/me/api'
import type { MySummary } from '@/features/me/types'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

function Section({ title, to, filters }: { title: string; to: string; filters: CatalogFilters }) {
  const q = useQuery({
    queryKey: auctionKeys.catalog(filters),
    queryFn: ({ signal }) => fetchCatalog(filters, signal),
    refetchInterval: 15_000,
  })
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        <Link to={to} className="text-sm underline underline-offset-4">
          Ver todo
        </Link>
      </div>
      {q.data && q.data.results.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {q.data.results.map((a) => (
            <AuctionCard key={a.id} auction={a} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {q.isPending ? 'Cargando…' : 'Nada por ahora.'}
        </p>
      )}
    </section>
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
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">
        Mi <span className="accent-word text-primary">actividad</span>
      </h1>
      {summary.isPending ? (
        <PageLoading />
      ) : summary.isError ? (
        <ErrorAlert error={summary.error} title="No se pudo cargar tu resumen" />
      ) : (
        <SummaryView s={summary.data} />
      )}
      {hasCapability(me, Cap.WATCHLIST_MANAGE_OWN) && (
        <Section
          title="Subastas que sigo"
          to="/seguimiento"
          filters={{ mine: 'watching', status: 'active', page_size: 3 }}
        />
      )}
      {hasCapability(me, Cap.AUCTION_MANAGE_OWN) && (
        <Section
          title="Mis subastas activas"
          to="/mis-subastas?estado=active"
          filters={{ mine: 'owner', status: 'active', page_size: 3 }}
        />
      )}
    </div>
  )
}

function Tile({
  label,
  value,
  to,
  tone,
}: {
  label: string
  value: number
  to: string
  tone?: string
}) {
  return (
    <Link
      to={to}
      aria-label={`${label}: ${value}`}
      className="flex flex-col gap-1 rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <span className={cn('text-3xl font-extrabold tabular-nums', value > 0 && tone)}>{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </Link>
  )
}

function SummaryView({ s }: { s: MySummary }) {
  const p = s.participations
  const m = s.my_auctions
  const o = s.operations
  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby="sum-part">
        <h2 id="sum-part" className="text-lg font-bold">
          Mis pujas
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Vas ganando" value={p.leading} to="/mis-pujas" tone="text-emerald-700" />
          <Tile label="Te superaron" value={p.outbid} to="/mis-pujas" tone="text-red-700" />
          <Tile label="Ofertas selladas" value={p.sealed_offers} to="/mis-pujas" />
          <Tile label="Ganadas" value={p.won} to="/mis-pujas?tab=won" />
        </div>
      </section>
      <section className="space-y-3" aria-labelledby="sum-own">
        <h2 id="sum-own" className="text-lg font-bold">
          Mis subastas
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Borradores" value={m.draft} to="/mis-subastas?estado=draft" />
          <Tile
            label="Programadas o activas"
            value={m.scheduled_or_active}
            to="/mis-subastas?estado=active"
          />
          <Tile label="Vendidas" value={m.sold} to="/mis-subastas?estado=closed" />
          <Tile label="Sin venta" value={m.unsold} to="/mis-subastas?estado=closed" />
        </div>
        {s.unread_notifications > 0 && (
          <p className="text-sm">
            Tienes{' '}
            <Link to="/notificaciones" className="font-medium underline underline-offset-2">
              {s.unread_notifications}{' '}
              {s.unread_notifications === 1 ? 'notificación sin leer' : 'notificaciones sin leer'}
            </Link>
            .
          </p>
        )}
      </section>
      <section
        className="space-y-3 rounded-2xl border bg-card p-6 shadow-sm"
        aria-labelledby="sum-ops"
      >
        <h2 id="sum-ops" className="text-lg font-bold">
          Resumen de operaciones
        </h2>
        <Alert>{o.notice}</Alert>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Comprado (adjudicado)</dt>
          <dd className="tabular-nums">{formatMoney(o.bought_total)}</dd>
          <dt className="text-muted-foreground">Vendido (adjudicado)</dt>
          <dd className="tabular-nums">{formatMoney(o.sold_total)}</dd>
          <dt className="text-muted-foreground">Liquidado como comprador</dt>
          <dd className="tabular-nums">{formatMoney(o.settled_as_buyer)}</dd>
          <dt className="text-muted-foreground">Liquidado como vendedor</dt>
          <dd className="tabular-nums">{formatMoney(o.settled_as_seller)}</dd>
          <dt className="text-muted-foreground">Liquidaciones pendientes</dt>
          <dd className="tabular-nums">{o.pending_settlements}</dd>
        </dl>
      </section>
    </div>
  )
}
