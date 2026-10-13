import { AuctionList } from '@/features/auctions/AuctionList'
import { resultLinkIfFinished } from '@/features/auctions/links'

/** `/seguimiento` (capacidad `watchlist.manage_own`): subastas que el usuario sigue. */
export default function WatchingPage() {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Subastas que sigo</h1>
      <AuctionList
        mine="watching"
        tabs={[
          { label: 'Activas', status: 'active' },
          { label: 'Programadas', status: 'scheduled' },
          { label: 'Terminadas', status: 'closed' },
        ]}
        empty="No sigues subastas en este estado. Usa «Seguir subasta» en el detalle de una subasta."
        linkFor={resultLinkIfFinished}
      />
    </section>
  )
}
