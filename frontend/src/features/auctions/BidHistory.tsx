import { useQuery } from '@tanstack/react-query'

import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

import { auctionKeys, fetchBids } from './api'
import { SOURCE_LABEL } from './labels'

/** Historial visible: seudónimos ("Postor N" / "Tú"); se recarga cuando cambia `version`. */
export function BidHistory({ auctionId, sealed }: { auctionId: string; sealed: boolean }) {
  const bids = useQuery({
    queryKey: auctionKeys.bids(auctionId),
    queryFn: ({ signal }) => fetchBids(auctionId, signal),
  })

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">Historial de pujas</h2>
      {bids.isPending ? (
        <PageLoading />
      ) : bids.isError ? (
        <ErrorAlert error={bids.error} />
      ) : bids.data.results.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {sealed
            ? 'Las ofertas son secretas hasta el cierre.'
            : 'Todavía no hay pujas. ¡Puedes ser la primera persona en pujar!'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Postor</th>
                <th className="px-3 py-2 text-right font-medium">Importe</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Hora</th>
              </tr>
            </thead>
            <tbody>
              {bids.data.results.map((b) => (
                <tr key={b.seq} className="border-t">
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{b.seq}</td>
                  <td className={b.bidder === 'Tú' ? 'px-3 py-2 font-medium' : 'px-3 py-2'}>
                    {b.bidder}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(b.amount)}</td>
                  <td className="px-3 py-2">{SOURCE_LABEL[b.source] ?? b.source}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {formatDateTime(b.accepted_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
