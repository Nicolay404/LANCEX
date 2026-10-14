import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { isApiError } from '@/api/errors'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { auctionKeys, fetchAuction, fetchResult, updateSettlement } from '@/features/auctions/api'
import { MECHANISM_LABEL } from '@/features/auctions/labels'
import { SealedRanking } from '@/features/auctions/SealedRanking'
import { StatusBadge } from '@/features/auctions/StatusBadge'
import type { AuctionDetail, AuctionResult } from '@/features/auctions/types'
import { formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

const SETTLEMENT_LABEL: Record<string, string> = {
  pending: 'Pendiente de concretar entre las partes',
  completed: 'Concretada',
  failed: 'No se concretó',
}

/** `/subastas/:id/resultado` (público; cada audiencia ve lo suyo según el backend). LX-29. */
export default function AuctionResultPage() {
  const { id = '' } = useParams()
  const detail = useQuery({
    queryKey: auctionKeys.detail(id),
    queryFn: ({ signal }) => fetchAuction(id, signal),
  })
  const result = useQuery({
    queryKey: auctionKeys.result(id),
    queryFn: ({ signal }) => fetchResult(id, signal),
    // Si el cierre aún se está calculando, se vuelve a pedir en unos segundos.
    refetchInterval: (q) => (q.state.data?.result_pending ? 3_000 : false),
  })

  if (detail.isPending || result.isPending) return <PageLoading />
  const error = detail.error ?? result.error
  if (error) {
    if (isApiError(error) && error.status === 404) return <NotFoundPage />
    return <ErrorAlert error={error} title="No se pudo cargar el resultado" />
  }
  return <ResultView a={detail.data!} r={result.data!} />
}

function ResultView({ a, r }: { a: AuctionDetail; r: AuctionResult }) {
  return (
    <section className="max-w-2xl space-y-6">
      <header className="space-y-2">
        <Link to={`/subastas/${a.id}`} className="text-sm text-muted-foreground hover:underline">
          ← Volver a la subasta
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Resultado: {a.title ?? 'Subasta'}
          </h1>
          <StatusBadge status={r.status} resultPending={r.result_pending} />
        </div>
        <p className="text-sm text-muted-foreground">{MECHANISM_LABEL[a.mechanism]}</p>
      </header>
      <Outcome a={a} r={r} />
      {a.closing_policy === 'candle' && r.status === 'closed' && !r.result_pending && (
        <Link
          to={`/subastas/${a.id}/verificar-vela`}
          className="inline-block text-sm underline underline-offset-4"
        >
          Verificar el cierre por vela
        </Link>
      )}
      {a.mechanism === 'sealed' && r.status === 'closed' && !r.result_pending && (
        <SealedRanking auctionId={a.id} closed />
      )}
    </section>
  )
}

function Outcome({ a, r }: { a: AuctionDetail; r: AuctionResult }) {
  if (r.status === 'scheduled' || r.status === 'active' || r.status === 'draft') {
    return (
      <Alert>
        La subasta todavía no termina.{' '}
        <Link to={`/subastas/${a.id}`} className="underline underline-offset-4">
          Ir a la subasta
        </Link>
      </Alert>
    )
  }
  if (r.status === 'cancelled') {
    return (
      <Alert>
        La subasta se canceló el {formatDateTime(r.cancelled_at)}. No hay ganador.
        {a.cancel_reason ? ` Motivo: ${a.cancel_reason}` : ''}
      </Alert>
    )
  }
  if (r.result_pending) return <PageLoading label="Calculando el resultado…" />

  const count =
    a.mechanism === 'sealed'
      ? `${r.offer_count ?? 0} ${r.offer_count === 1 ? 'oferta' : 'ofertas'}`
      : `${r.bid_count ?? 0} ${r.bid_count === 1 ? (a.mechanism === 'reverse' ? 'oferta' : 'puja') : a.mechanism === 'reverse' ? 'ofertas' : 'pujas'}`

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5 shadow-xs">
        {r.outcome === 'awarded' ? (
          <>
            <p className="text-xs text-muted-foreground">Precio final</p>
            <p className="text-3xl font-semibold tabular-nums">{formatMoney(r.final_price)}</p>
            {r.winner_organization && (
              <p className="text-sm">Proveedor ganador: {r.winner_organization.legal_name}</p>
            )}
            {r.winner_pseudonym && <p className="text-sm">Ganador: {r.winner_pseudonym}</p>}
          </>
        ) : (
          <>
            <p className="text-xl font-semibold">Sin venta</p>
            <p className="text-sm text-muted-foreground">
              {r.has_reserve && r.reserve_met === false
                ? 'No se alcanzó el precio de reserva.'
                : 'No hubo ofertas válidas.'}
            </p>
          </>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          {count} · Cerró el {formatDateTime(r.closed_at)}
        </p>
      </div>

      <ViewerOutcome a={a} r={r} />
    </div>
  )
}

/** Lo que solo ve el propio usuario: si ganó, su puesto, y el contacto de la contraparte. */
function ViewerOutcome({ a, r }: { a: AuctionDetail; r: AuctionResult }) {
  if (!r.viewer) return null
  const { is_owner, is_winner, rank } = r.viewer
  return (
    <div className="space-y-3">
      {is_winner && <Alert variant="success">¡Ganaste esta subasta!</Alert>}
      {!is_winner && !is_owner && typeof rank === 'number' && (
        <Alert>Tu oferta quedó en el puesto {rank}.</Alert>
      )}
      {is_owner && r.outcome === 'unsold' && (
        <Alert>
          Tu artículo no se vendió. Puedes{' '}
          <Link to="/mis-publicaciones" className="underline underline-offset-4">
            crear otra subasta
          </Link>{' '}
          con la misma publicación.
        </Alert>
      )}
      {r.contact && (
        <section className="space-y-1 rounded-xl border p-4 text-sm">
          <h2 className="font-medium">{is_owner ? 'Datos del ganador' : 'Datos del vendedor'}</h2>
          <p>{r.contact.display_name}</p>
          <p>
            <a href={`mailto:${r.contact.email}`} className="underline underline-offset-4">
              {r.contact.email}
            </a>
          </p>
          {r.settlement_status && (
            <p className="text-muted-foreground">
              Entrega y pago: {SETTLEMENT_LABEL[r.settlement_status] ?? r.settlement_status}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            LANCEX no procesa pagos: coordinen la entrega directamente.
          </p>
        </section>
      )}
      {is_owner && r.outcome === 'awarded' && r.settlement_status === 'pending' && (
        <SettlementPanel auctionId={a.id} />
      )}
      {r.viewer.can_rate && (
        <Button asChild>
          <Link to={`/calificar/${a.id}`}>Calificar {is_owner ? 'al ganador' : 'al vendedor'}</Link>
        </Button>
      )}
      {r.viewer.my_rating && (
        <p className="text-sm text-muted-foreground">
          Tu calificación: <Stars score={r.viewer.my_rating.score} />
          {r.viewer.my_rating.comment && ` · ${r.viewer.my_rating.comment}`}
        </p>
      )}
      {is_owner && !r.contact && a.mechanism !== 'reverse' && r.outcome === 'awarded' && (
        <p className="text-sm text-muted-foreground">El contacto del ganador aparecerá aquí.</p>
      )}
    </div>
  )
}

function Stars({ score }: { score: number }) {
  return (
    <span aria-label={`${score} de 5`} className="text-amber-400">
      {'★'.repeat(score)}
      <span className="text-muted-foreground">{'☆'.repeat(5 - score)}</span>
    </span>
  )
}

/** Liquidación: el dueño registra si el trato se concretó. Es final (REGLAS §10). */
function SettlementPanel({ auctionId }: { auctionId: string }) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'idle' | 'completed' | 'failed'>('idle')
  const [note, setNote] = useState('')
  const mutation = useMutation({
    mutationFn: () =>
      updateSettlement(auctionId, mode === 'failed' ? 'failed' : 'completed', note.trim()),
    onSuccess: () => {
      setMode('idle')
      void queryClient.invalidateQueries({ queryKey: auctionKeys.result(auctionId) })
    },
  })
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">¿Se concretó la venta?</h2>
      <p className="text-sm text-muted-foreground">
        Registra el resultado cuando la entrega y el pago se hayan resuelto. Es definitivo y
        habilita las calificaciones.
      </p>
      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setMode('completed')}>
            Sí, se concretó
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode('failed')}>
            No se concretó
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {mode === 'failed' && (
            <>
              <Label htmlFor="settlement-note">¿Qué pasó?</Label>
              <Textarea
                id="settlement-note"
                rows={2}
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </>
          )}
          <p className="text-sm">
            {mode === 'completed'
              ? 'Confirmas que la venta se concretó. No se puede cambiar después.'
              : 'Confirmas que la venta no se concretó. No se puede cambiar después.'}
          </p>
          {mutation.isError && <ErrorAlert error={mutation.error} title="No se pudo guardar" />}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === 'failed' ? 'destructive' : 'default'}
              disabled={mutation.isPending || (mode === 'failed' && note.trim().length < 3)}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Guardando…' : 'Confirmar'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode('idle')}>
              Volver
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
