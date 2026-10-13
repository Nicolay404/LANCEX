import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { AuctionList } from '@/features/auctions/AuctionList'
import { resultLinkIfFinished } from '@/features/auctions/links'
import { Cap, hasCapability } from '@/features/auth/capabilities'
import { useMe } from '@/features/auth/session'

/** `/mis-subastas` (capacidad `auction.manage_own`): subastas propias por estado (LX-29). */
export default function MyAuctionsPage() {
  const me = useMe()
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Mis subastas</h1>
        {hasCapability(me, Cap.AUCTION_CREATE_PERSONAL) && (
          <Button asChild>
            <Link to="/mis-subastas/nueva">Nueva subasta</Link>
          </Button>
        )}
      </header>
      <AuctionList
        mine="owner"
        tabs={[
          { label: 'Todas', status: '' },
          { label: 'Borradores', status: 'draft' },
          { label: 'Programadas', status: 'scheduled' },
          { label: 'Activas', status: 'active' },
          { label: 'Cerradas', status: 'closed' },
          { label: 'Canceladas', status: 'cancelled' },
        ]}
        empty="No tienes subastas en este estado."
        linkFor={resultLinkIfFinished}
      />
    </section>
  )
}
