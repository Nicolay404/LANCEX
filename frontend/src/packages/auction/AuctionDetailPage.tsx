import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'

import { isApiError } from '@/api/errors'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { auctionKeys, cancelAuction, fetchBids, publishAuction } from '@/features/auctions/api'
import { BidForm } from '@/features/auctions/BidForm'
import { BidHistory } from '@/features/auctions/BidHistory'
import { ExtensionNotice } from '@/features/auctions/ExtensionNotice'
import { ProxyLimitPanel } from '@/features/auctions/ProxyLimitPanel'
import { SealedOfferPanel } from '@/features/auctions/SealedOfferPanel'
import { SealedRanking } from '@/features/auctions/SealedRanking'
import { WatchButton } from '@/features/auctions/WatchButton'
import { Countdown } from '@/features/auctions/Countdown'
import { CLOSING_LABEL, MECHANISM_LABEL } from '@/features/auctions/labels'
import { priceLines } from '@/features/auctions/PriceSummary'
import { StatusBadge } from '@/features/auctions/StatusBadge'
import { useAuctionLive, type MergedAuction } from '@/features/auctions/useAuctionLive'
import { Cap, hasCapability } from '@/features/auth/capabilities'
import { loginPathFor } from '@/features/auth/nextPath'
import { useMe } from '@/features/auth/session'
import { ReportButton } from '@/features/reports/ReportButton'
import { ITEM_CONDITION_LABEL, type ItemCondition } from '@/features/listings/types'
import { formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

/** `/subastas/:id`: detalle público con acciones según capacidades (LX-27). */
export default function AuctionDetailPage() {
  const { id = '' } = useParams()
  const { detail, merged } = useAuctionLive(id)

  if (detail.isPending) return <PageLoading />
  if (detail.isError) {
    if (isApiError(detail.error) && detail.error.status === 404) return <NotFoundPage />
    return <ErrorAlert error={detail.error} title="No se pudo cargar la subasta" />
  }
  if (!merged) return null
  return <AuctionView a={merged} />
}

function AuctionView({ a }: { a: MergedAuction }) {
  const me = useMe()
  const location = useLocation()
  const queryClient = useQueryClient()
  const price = priceLines(a)
  const isSealed = a.mechanism === 'sealed'
  const refreshLive = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: auctionKeys.live(a.id) }),
    [queryClient, a.id],
  )

  const created =
    (location.state as { created?: string; publishError?: string | null } | null) ?? null

  const canBidHere =
    hasCapability(me, Cap.BID_PLACE) && a.mechanism === 'ascending' && !a.viewer?.is_owner

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <article className="space-y-6">
        <header className="space-y-2">
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            ← Subastas
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{a.title ?? 'Subasta'}</h1>
            <StatusBadge status={a.status} resultPending={a.result_pending} />
          </div>
          <p className="text-sm text-muted-foreground">
            {[a.category?.name, MECHANISM_LABEL[a.mechanism], CLOSING_LABEL[a.closing_policy]]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </header>

        {a.images.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[...a.images]
              .sort((x, y) => x.position - y.position)
              .map((img) => (
                <li key={img.position}>
                  <img
                    src={img.url}
                    alt={`Imagen ${img.position + 1} de ${a.title ?? 'la subasta'}`}
                    className="aspect-square w-full rounded-lg border object-cover"
                    referrerPolicy="no-referrer"
                  />
                </li>
              ))}
          </ul>
        )}

        {a.description && (
          <section className="space-y-2">
            <h2 className="text-lg font-medium">Descripción</h2>
            {/* Texto plano: nunca HTML del usuario (PANTALLAS §9). */}
            <p className="text-sm leading-relaxed whitespace-pre-line">{a.description}</p>
            <p className="text-xs text-muted-foreground">
              {[
                a.item_condition && ITEM_CONDITION_LABEL[a.item_condition as ItemCondition],
                a.location_city,
              ]
                .filter(Boolean)
                .join(' · ')}
              {' · Vende '}
              <Link to={`/usuarios/${a.seller.id}`} className="underline underline-offset-2">
                {a.seller.display_name}
              </Link>
              {a.seller.rating_avg ? ` (★ ${a.seller.rating_avg}, ${a.seller.rating_count})` : ''}
            </p>
          </section>
        )}

        <Rules a={a} />
        {isSealed ? (
          <SealedRanking auctionId={a.id} closed={a.status === 'closed'} />
        ) : (
          <BidHistory auctionId={a.id} sealed={false} />
        )}
      </article>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        {created?.created === 'published' && a.status !== 'draft' && (
          <Alert variant="success">Subasta publicada. Las reglas ya no se pueden cambiar.</Alert>
        )}
        {created?.created === 'draft' && a.status === 'draft' && !created.publishError && (
          <Alert variant="success">Borrador guardado. Revísalo y publícalo cuando quieras.</Alert>
        )}
        {created?.publishError && a.status === 'draft' && (
          <Alert variant="destructive">
            Se guardó como borrador, pero no se pudo publicar: {created.publishError}
          </Alert>
        )}
        {a.status === 'draft' && a.viewer?.is_owner && <PublishDraft auctionId={a.id} />}
        {(a.status === 'closed' || a.status === 'cancelled') && (
          <Button asChild className="w-full">
            <Link to={`/subastas/${a.id}/resultado`}>Ver resultado</Link>
          </Button>
        )}
        <div className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
          <div>
            <p className="text-xs text-muted-foreground">{price.label}</p>
            <p className="text-3xl font-semibold tabular-nums">{price.value}</p>
            {price.detail && <p className="text-sm text-muted-foreground">{price.detail}</p>}
            {a.candle?.price_is_provisional && (
              <p className="text-xs text-amber-700">Precio provisional</p>
            )}
          </div>

          <p className="text-sm font-medium tabular-nums">
            {a.status === 'active' && (
              <Countdown
                target={a.ends_at}
                prefix="Termina en"
                elapsedLabel="Cerrando…"
                onElapsed={refreshLive}
              />
            )}
            {a.status === 'scheduled' && (
              <Countdown
                target={a.starts_at}
                prefix="Empieza en"
                elapsedLabel="Empezando…"
                onElapsed={refreshLive}
              />
            )}
            {a.status === 'closed' &&
              (a.result_pending ? 'Cerrada · calculando resultado…' : 'Subasta cerrada')}
            {a.status === 'cancelled' && 'Subasta cancelada'}
          </p>
          {a.soft_close?.extended && (
            <p className="text-xs text-amber-700">
              El cierre se extendió por pujas de último momento (antes:{' '}
              {formatDateTime(a.soft_close.original_ends_at)}).
            </p>
          )}
          {a.candle?.notice && <p className="text-xs text-amber-700">{a.candle.notice}</p>}
          {a.closing_policy === 'soft_close' && a.status === 'active' && (
            <ExtensionNotice key={a.id} endsAt={a.ends_at} />
          )}

          {a.has_reserve && a.reserve_met !== null && (
            <p className="text-xs text-muted-foreground">
              {a.reserve_met
                ? 'Precio de reserva alcanzado.'
                : 'Aún no se alcanza el precio de reserva.'}
            </p>
          )}

          <LeaderBadge a={a} />

          {a.status === 'active' && canBidHere && (
            <BidForm
              auctionId={a.id}
              minimumNextBid={a.minimum_next_bid}
              currentPrice={a.current_price}
              version={a.liveVersion}
            />
          )}
          {a.status === 'active' &&
            isSealed &&
            !a.viewer?.is_owner &&
            hasCapability(me, Cap.SEALED_MANAGE_OWN) && (
              <SealedOfferPanel auctionId={a.id} minimum={a.minimum_next_bid} />
            )}
          {a.status === 'active' &&
            canBidHere &&
            a.proxy_enabled &&
            hasCapability(me, Cap.PROXY_MANAGE_OWN) && (
              <ProxyLimitPanel
                auctionId={a.id}
                minimumNextBid={a.minimum_next_bid}
                isLeader={a.viewerIsLeader}
              />
            )}
          {a.viewer &&
            !a.viewer.is_owner &&
            (a.status === 'active' || a.status === 'scheduled') &&
            hasCapability(me, Cap.WATCHLIST_MANAGE_OWN) && (
              <WatchButton auctionId={a.id} watching={a.viewer.watching} />
            )}
          {a.status !== 'draft' && !a.viewer?.is_owner && hasCapability(me, Cap.REPORT_CREATE) && (
            <ReportButton targetType="auction" targetId={a.id} className="w-full" />
          )}
          {a.status === 'active' && !me && a.mechanism !== 'reverse' && (
            <Button asChild className="w-full">
              <Link to={loginPathFor(location.pathname)}>
                {isSealed ? 'Ingresa para ofertar' : 'Ingresa para pujar'}
              </Link>
            </Button>
          )}
          {a.viewer?.is_owner && (
            <p className="text-sm text-muted-foreground">Es tu subasta: no puedes pujar.</p>
          )}
          {a.status === 'active' &&
            me &&
            !a.viewer?.is_owner &&
            a.mechanism === 'reverse' &&
            hasCapability(me, Cap.BID_PLACE) && (
              <p className="text-sm text-muted-foreground">
                Ofertar en esta modalidad estará disponible pronto.
              </p>
            )}
        </div>
        {a.viewer?.is_owner && canOwnerCancel(a) && <CancelOwnAuction auctionId={a.id} />}
      </aside>
    </div>
  )
}

/** REGLAS §9: el dueño cancela borrador o programada siempre; activa solo si nadie participó. */
function canOwnerCancel(a: MergedAuction): boolean {
  if (a.status === 'draft' || a.status === 'scheduled') return true
  if (a.status !== 'active') return false
  return a.mechanism === 'sealed' ? (a.active_offer_count ?? 0) === 0 : (a.bid_count ?? 0) === 0
}

function CancelOwnAuction({ auctionId }: { auctionId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: () => cancelAuction(auctionId, reason.trim()),
    onSuccess: (detail) => {
      queryClient.setQueryData(auctionKeys.detail(auctionId), detail)
      void queryClient.invalidateQueries({ queryKey: auctionKeys.all(auctionId) })
      setOpen(false)
    },
  })
  const tooShort = reason.trim().length < 3
  if (!open) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
        Cancelar subasta
      </Button>
    )
  }
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <Label htmlFor="cancel-reason">Motivo de la cancelación</Label>
      <Textarea
        id="cancel-reason"
        rows={3}
        maxLength={300}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Se notificará a quienes siguen la subasta."
      />
      {mutation.isError && <ErrorAlert error={mutation.error} title="No se pudo cancelar" />}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="destructive"
          disabled={tooShort || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Cancelando…' : 'Confirmar cancelación'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen(false)}
          disabled={mutation.isPending}
        >
          Volver
        </Button>
      </div>
      {tooShort && <p className="text-xs text-muted-foreground">Escribe al menos 3 caracteres.</p>}
    </div>
  )
}

/** Borrador propio: solo el dueño lo ve (visible_to) y puede publicarlo (LX-28). */
function PublishDraft({ auctionId }: { auctionId: string }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const mutation = useMutation({
    mutationFn: () => publishAuction(auctionId),
    onSuccess: (detail) => {
      queryClient.setQueryData(auctionKeys.detail(auctionId), detail)
      void queryClient.invalidateQueries({ queryKey: auctionKeys.all(auctionId) })
    },
  })
  return (
    <div className="space-y-3 rounded-xl border border-dashed p-4">
      <p className="text-sm">
        <strong>Borrador.</strong> Solo tú lo ves. Al publicarlo, las reglas quedan congeladas.
      </p>
      {mutation.isError && <ErrorAlert error={mutation.error} title="No se pudo publicar" />}
      {confirming ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Publicando…' : 'Sí, publicar'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirming(false)}
            disabled={mutation.isPending}
          >
            Cancelar
          </Button>
        </div>
      ) : (
        <Button size="sm" onClick={() => setConfirming(true)}>
          Publicar subasta
        </Button>
      )}
    </div>
  )
}

/** "Vas ganando / Te superaron": nunca en sobre cerrado (revelaría información, PANTALLAS §3). */
function LeaderBadge({ a }: { a: MergedAuction }) {
  // Mismo caché que el historial: saber si el usuario ya pujó (aparece como "Tú").
  const bids = useQuery({
    queryKey: auctionKeys.bids(a.id),
    queryFn: ({ signal }) => fetchBids(a.id, signal),
    enabled: !!a.viewer && a.mechanism !== 'sealed',
  })
  if (!a.viewer || a.viewer.is_owner || a.mechanism === 'sealed') return null
  if (a.status !== 'active' && a.status !== 'closed') return null
  if (a.viewerIsLeader) {
    return (
      <Alert variant="success">
        {a.status === 'active' ? 'Vas ganando.' : 'Ibas ganando al cierre.'}
      </Alert>
    )
  }
  const participated = bids.data?.results.some((b) => b.bidder === 'Tú') ?? false
  if (participated && a.status === 'active') {
    return (
      <Alert variant="destructive">
        Te superaron. Puja de nuevo para recuperar el primer lugar.
      </Alert>
    )
  }
  return null
}

function Rules({ a }: { a: MergedAuction }) {
  const rows: [string, string][] = [
    ['Modalidad', MECHANISM_LABEL[a.mechanism]],
    ['Cierre', CLOSING_LABEL[a.closing_policy]],
  ]
  if (a.starting_price)
    rows.push([
      a.mechanism === 'sealed' ? 'Oferta mínima' : 'Precio inicial',
      formatMoney(a.starting_price),
    ])
  if (a.min_increment) rows.push(['Incremento mínimo', formatMoney(a.min_increment)])
  rows.push(['Precio de reserva', a.has_reserve ? 'Sí (oculto)' : 'No'])
  if (a.reserve_price) rows.push(['Tu precio de reserva', formatMoney(a.reserve_price)])
  rows.push(['Puja automática', a.proxy_enabled ? 'Habilitada' : 'No'])
  if (a.soft_close) {
    rows.push([
      'Extensión',
      `Pujas en los últimos ${Math.round(a.soft_close.window_s / 60)} min extienden ${Math.round(a.soft_close.extension_s / 60)} min`,
    ])
  }
  rows.push(['Inicio', formatDateTime(a.starts_at)], ['Fin', formatDateTime(a.ends_at)])

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-medium">Reglas</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Las reglas quedan congeladas al publicar la subasta.
      </p>
    </section>
  )
}
