import { useQuery } from '@tanstack/react-query'

import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

import { auctionKeys, fetchSealedRanking } from './api'

/**
 * Ranking de sobre cerrado tras el cierre, tal como lo entrega el backend por audiencia:
 * participantes con seudónimos ("Postor N" / "Tú"), dueño con identidad; público, lista vacía.
 */
export function SealedRanking({ auctionId, closed }: { auctionId: string; closed: boolean }) {
  const q = useQuery({
    queryKey: auctionKeys.bids(auctionId),
    queryFn: ({ signal }) => fetchSealedRanking(auctionId, signal),
  })
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{closed ? 'Ranking de ofertas' : 'Ofertas'}</h2>
      {q.isPending ? (
        <PageLoading />
      ) : q.isError ? (
        <ErrorAlert error={q.error} />
      ) : !closed ? (
        <p className="text-sm text-muted-foreground">Las ofertas son secretas hasta el cierre.</p>
      ) : q.data.results.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          El ranking solo lo ven quienes ofertaron y el vendedor.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Puesto</th>
                <th className="px-3 py-2 font-medium">Postor</th>
                <th className="px-3 py-2 text-right font-medium">Oferta</th>
                <th className="px-3 py-2 font-medium">Enviada</th>
              </tr>
            </thead>
            <tbody>
              {q.data.results.map((r) => (
                <tr key={r.rank} className="border-t">
                  <td className="px-3 py-2 tabular-nums">
                    {r.rank}
                    {r.is_winner && (
                      <span className="ml-2 rounded bg-emerald-100 px-1.5 text-xs text-emerald-800">
                        Ganadora
                      </span>
                    )}
                  </td>
                  <td className={r.bidder === 'Tú' ? 'px-3 py-2 font-medium' : 'px-3 py-2'}>
                    {r.bidder_identity
                      ? `${r.bidder_identity.display_name} (${r.bidder})`
                      : r.bidder}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.amount)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {formatDateTime(r.submitted_at)}
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
