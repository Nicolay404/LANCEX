import { useQuery } from '@tanstack/react-query'

import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

import { auctionKeys, fetchBids } from './api'
import { SOURCE_LABEL } from './labels'

/**
 * Historial visible: seudónimos ("Postor N" / "Tú"; en la inversa "Proveedor N" / "Tu organización");
 * se recarga cuando cambia `version`. El desglose de la inversa solo llega para tu organización.
 */
export function BidHistory({
  auctionId,
  sealed,
  reverse = false,
}: {
  auctionId: string
  sealed: boolean
  reverse?: boolean
}) {
  const bids = useQuery({
    queryKey: auctionKeys.bids(auctionId),
    queryFn: ({ signal }) => fetchBids(auctionId, signal),
  })

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">
        {reverse ? 'Historial de ofertas' : 'Historial de pujas'}
      </h2>
      {bids.isPending ? (
        <PageLoading />
      ) : bids.isError ? (
        <ErrorAlert error={bids.error} />
      ) : bids.data.results.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {sealed
            ? 'Las ofertas son secretas hasta el cierre.'
            : reverse
              ? 'Todavía no hay ofertas.'
              : 'Todavía no hay pujas. ¡Puedes ser la primera persona en pujar!'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">{reverse ? 'Proveedor' : 'Postor'}</th>
                <th className="px-3 py-2 text-right font-medium">
                  {reverse ? 'Total' : 'Importe'}
                </th>
                <th className="px-3 py-2 font-medium">{reverse ? 'Desglose' : 'Tipo'}</th>
                <th className="px-3 py-2 font-medium">Hora</th>
              </tr>
            </thead>
            <tbody>
              {bids.data.results.map((b) => (
                <tr key={b.seq} className="border-t">
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{b.seq}</td>
                  <td
                    className={
                      b.bidder === 'Tú' || b.bidder === 'Tu organización'
                        ? 'px-3 py-2 font-medium'
                        : 'px-3 py-2'
                    }
                  >
                    {b.bidder}
                    {b.bidder_identity && (
                      <span className="block text-xs text-muted-foreground">
                        {b.bidder_identity.legal_name}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(b.amount)}</td>
                  <td className="px-3 py-2">
                    {reverse
                      ? b.unit_price
                        ? `${b.unit_price} c/u + envío ${formatMoney(b.shipping_cost)}`
                        : '—'
                      : b.source && (SOURCE_LABEL[b.source] ?? b.source)}
                    {b.counted === false && (
                      <span
                        className="ml-2 rounded bg-muted px-1.5 text-xs text-muted-foreground"
                        title="Llegó después del instante secreto de la vela"
                      >
                        No contó
                      </span>
                    )}
                  </td>
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
