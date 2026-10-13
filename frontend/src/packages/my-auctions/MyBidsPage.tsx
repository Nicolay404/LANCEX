import { AuctionList } from '@/features/auctions/AuctionList'
import { resultLinkIfFinished } from '@/features/auctions/links'

/** `/mis-pujas` (capacidad `bid.place`): subastas donde el usuario pujó (LX-29). */
export default function MyBidsPage() {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Mis pujas</h1>
      <AuctionList
        mine="participating"
        tabs={[
          { label: 'Activas', status: 'active' },
          { label: 'Terminadas', status: 'closed' },
          { label: 'Canceladas', status: 'cancelled' },
        ]}
        empty="Todavía no participas en subastas en este estado."
        linkFor={resultLinkIfFinished}
      />
    </section>
  )
}
