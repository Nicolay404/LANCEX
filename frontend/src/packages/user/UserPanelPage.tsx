import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { auctionKeys, fetchCatalog } from '@/features/auctions/api'
import { AuctionCard } from '@/features/auctions/AuctionCard'
import type { CatalogFilters } from '@/features/auctions/types'
import { Cap, hasCapability } from '@/features/auth/capabilities'
import { useMe } from '@/features/auth/session'

function Section({ title, to, filters }: { title: string; to: string; filters: CatalogFilters }) {
  const q = useQuery({
    queryKey: auctionKeys.catalog(filters),
    queryFn: ({ signal }) => fetchCatalog(filters, signal),
    refetchInterval: 15_000,
  })
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium">{title}</h2>
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

/** `/panel` (paquete `user`, capacidad `bid.place`): resumen de actividad (PANTALLAS §3). */
export default function UserPanelPage() {
  const me = useMe()
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Mi actividad</h1>
      <Section
        title="Subastas donde estoy pujando"
        to="/mis-pujas"
        filters={{ mine: 'participating', status: 'active', page_size: 3 }}
      />
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
