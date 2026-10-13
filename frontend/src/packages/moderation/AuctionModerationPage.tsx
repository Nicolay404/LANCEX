import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'

import { isApiError } from '@/api/errors'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { auctionKeys } from '@/features/auctions/api'
import {
  CLOSING_LABEL,
  MECHANISM_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
} from '@/features/auctions/labels'
import { Cap, hasCapability } from '@/features/auth/capabilities'
import { useMe } from '@/features/auth/session'
import { fetchModerationAuction, modKeys, moderatorCancelAuction } from '@/features/moderation/api'
import { formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

import { AuditList, ReasonAction } from './shared'

/**
 * `/moderacion/subastas/:auctionId` (capacidad `moderation.view_auction_internals`).
 * Pujas con identidades reales y auditoría. Se pinta solo lo que manda el backend: nunca
 * máximos automáticos y ofertas selladas solo tras la revelación.
 */
export function AuctionModerationPage() {
  const { auctionId = '' } = useParams()
  const me = useMe()
  const queryClient = useQueryClient()
  const internals = useQuery({
    queryKey: modKeys.auction(auctionId),
    queryFn: ({ signal }) => fetchModerationAuction(auctionId, signal),
  })
  const cancel = useMutation({
    mutationFn: (reason: string) => moderatorCancelAuction(auctionId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modKeys.all })
      void queryClient.invalidateQueries({ queryKey: auctionKeys.all(auctionId) })
    },
  })

  if (internals.isPending) return <PageLoading />
  if (internals.isError) {
    if (isApiError(internals.error) && internals.error.status === 404) return <NotFoundPage />
    return <ErrorAlert error={internals.error} />
  }
  const { auction: a, bids, sealed_offers, audit_events } = internals.data
  const canCancel =
    hasCapability(me, Cap.MODERATION_CANCEL_AUCTION) &&
    a.status !== 'closed' &&
    a.status !== 'cancelled'

  const rows: [string, string][] = [
    ['Modalidad', `${MECHANISM_LABEL[a.mechanism]} · ${CLOSING_LABEL[a.closing_policy]}`],
    ['Estado guardado', STATUS_LABEL[a.status] ?? a.status],
    ['Precio actual', formatMoney(a.current_price)],
    ['Precio de reserva', a.reserve_price ? formatMoney(a.reserve_price) : 'Sin reserva'],
    ['Inicio', formatDateTime(a.starts_at)],
    ['Fin', formatDateTime(a.ends_at)],
  ]
  if (a.bid_count !== null) rows.push(['Pujas', String(a.bid_count)])
  if (a.active_offer_count !== null) rows.push(['Ofertas vigentes', String(a.active_offer_count)])
  if (a.outcome) rows.push(['Resultado', a.outcome])
  if (a.final_price) rows.push(['Precio final', formatMoney(a.final_price)])
  if (a.cancel_reason) rows.push(['Motivo de cancelación', a.cancel_reason])

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Vista de moderación</h1>
        <p className="text-sm text-muted-foreground">
          <Link to={`/subastas/${a.id}`} className="underline underline-offset-2">
            Página pública
          </Link>
          {' · Dueño: '}
          <Link to={`/moderacion/usuarios/${a.owner.id}`} className="underline underline-offset-2">
            {a.owner.display_name}
          </Link>
        </p>
      </header>

      <dl className="grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {cancel.isSuccess && (
        <Alert variant="success">Subasta cancelada. Se avisó a participantes y seguidores.</Alert>
      )}
      {canCancel && !cancel.isSuccess && (
        <ReasonAction
          id="mod-cancel"
          trigger="Cancelar subasta"
          label="Motivo de la cancelación (lo verán participantes y seguidores)"
          confirmLabel="Confirmar cancelación"
          pendingLabel="Cancelando…"
          pending={cancel.isPending}
          error={cancel.error}
          onConfirm={(reason) => cancel.mutate(reason)}
        />
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Pujas con identidad</h2>
        {bids.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {a.mechanism === 'sealed' ? 'El sobre cerrado no tiene pujas públicas.' : 'Sin pujas.'}
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
                {bids.map((b) => (
                  <tr key={b.seq} className="border-t">
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{b.seq}</td>
                    <td className="px-3 py-2">
                      <Link
                        to={`/moderacion/usuarios/${b.bidder.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {b.bidder.display_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(b.amount)}</td>
                    <td className="px-3 py-2">
                      {SOURCE_LABEL[b.source] ?? b.source}
                      {b.counted === false && (
                        <span className="ml-2 rounded bg-muted px-1.5 text-xs">No contó</span>
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

      {a.mechanism === 'sealed' && (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Ofertas selladas</h2>
          {sealed_offers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Las ofertas selladas solo se muestran tras la revelación (al cierre).
            </p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {sealed_offers.map((o) => (
                <li key={o.seq} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                  <span>
                    {o.bidder.display_name}
                    {!o.is_current && <span className="text-muted-foreground"> (reemplazada)</span>}
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(o.amount)} · {o.status} · {formatDateTime(o.submitted_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Auditoría</h2>
        <AuditList events={audit_events} empty="Sin eventos registrados." />
      </section>
    </section>
  )
}
