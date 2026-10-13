import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'

import { newIdempotencyKey } from '@/api/client'
import { isApiError } from '@/api/errors'
import type { Money, UserMe } from '@/api/types'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { auctionKeys } from '@/features/auctions/api'
import type { AuctionStatus, BidAccepted } from '@/features/auctions/types'
import {
  formatMoney,
  isValidAmountInput,
  isValidUnitPriceInput,
  normalizeAmount,
  reverseTotal,
  toCents,
} from '@/lib/money'

import {
  fetchParticipants,
  placeReverseOffer,
  quoteReverseOffer,
  reverseKeys,
  type ReverseQuote,
} from './api'
import { supplierOrganizations } from './orgs'
import { PARTICIPANT_STATUS_LABEL, rejectionText, type ReverseInfo } from './types'

/** Errores tras los que repetir es seguro con la MISMA clave (el servidor deduplica). */
const RETRYABLE = new Set(['NETWORK_ERROR', 'INTERNAL_ERROR', 'INVALID_RESPONSE'])

/**
 * Sala del proveedor en una subasta inversa (LX-53). Solo una organización ADMITIDA oferta;
 * el servidor calcula el total y es la autoridad (`NOT_ADMITTED`, `OFFER_ABOVE_MAXIMUM`,
 * `ALREADY_LEADING`). Aquí solo se muestra una vista previa del total.
 */
export function ReverseOfferPanel({
  me,
  auctionId,
  status,
  reverse,
  maximumAllowed,
  version,
}: {
  me: UserMe
  auctionId: string
  status: AuctionStatus
  reverse: ReverseInfo
  maximumAllowed: Money | null
  version: number
}) {
  const suppliers = supplierOrganizations(me)
  const participants = useQuery({
    queryKey: reverseKeys.participants(auctionId),
    queryFn: ({ signal }) => fetchParticipants(auctionId, signal),
    enabled: suppliers.length > 0,
  })

  if (suppliers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Solo organizaciones proveedoras verificadas pueden ofertar en una subasta inversa.
      </p>
    )
  }
  if (participants.isPending) return <PageLoading label="Comprobando tu inscripción…" />
  if (participants.isError) return <ErrorAlert error={participants.error} />

  const mine = participants.data.results.filter((p) =>
    suppliers.some((o) => o.id === p.organization.id),
  )
  const admitted = mine.filter((p) => p.status === 'admitted')
  const unregistered = suppliers.filter((o) => !mine.some((p) => p.organization.id === o.id))

  return (
    <div className="space-y-3">
      {mine.length > 0 && (
        <ul className="space-y-1 text-sm">
          {mine.map((p) => (
            <li key={p.id}>
              <strong>{p.organization.legal_name}</strong>:{' '}
              {PARTICIPANT_STATUS_LABEL[p.status] ?? p.status}
              {p.status === 'rejected' && rejectionText(p.decision_reason) && (
                <span className="text-muted-foreground"> — {rejectionText(p.decision_reason)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {status === 'scheduled' &&
        unregistered.map((o) => (
          <Button key={o.id} asChild variant="outline" size="sm" className="w-full">
            <Link to={`/org/${o.id}/oportunidades/${auctionId}/inscripcion`}>
              Inscribir a {o.legal_name}
            </Link>
          </Button>
        ))}
      {status === 'active' &&
        (admitted.length > 0 ? (
          <OfferForm
            auctionId={auctionId}
            organizations={admitted.map((p) => p.organization)}
            quantity={reverse.quantity}
            maximumAllowed={maximumAllowed}
            version={version}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Tu organización no está admitida en esta subasta: no puede ofertar.
          </p>
        ))}
    </div>
  )
}

function OfferForm({
  auctionId,
  organizations,
  quantity,
  maximumAllowed,
  version,
}: {
  auctionId: string
  organizations: { id: string; legal_name: string }[]
  quantity: string
  maximumAllowed: Money | null
  version: number
}) {
  const queryClient = useQueryClient()
  const [orgId, setOrgId] = useState(organizations[0]!.id)
  const [unitPrice, setUnitPrice] = useState('')
  const [shipping, setShipping] = useState('0.00')
  const [clientError, setClientError] = useState<string | null>(null)
  const [result, setResult] = useState<BidAccepted | null>(null)
  /** Total oficial del servidor para los valores actuales; se descarta al cambiar algo. */
  const [quote, setQuote] = useState<(ReverseQuote & { signature: string }) | null>(null)
  const attempt = useRef<{ signature: string; key: string } | null>(null)

  const mutation = useMutation({
    mutationFn: (v: { unit_price: string; shipping_cost: string; key: string }) =>
      placeReverseOffer(
        auctionId,
        { unit_price: v.unit_price, shipping_cost: v.shipping_cost, organization_id: orgId },
        v.key,
      ),
    onSuccess: (data) => {
      attempt.current = null
      setResult(data)
      setQuote(null)
      setUnitPrice('')
      void queryClient.invalidateQueries({ queryKey: auctionKeys.all(auctionId) })
    },
    onError: (error) => {
      if (!(isApiError(error) && RETRYABLE.has(error.code))) attempt.current = null
      if (isApiError(error) && error.code === 'OFFER_ABOVE_MAXIMUM') {
        void queryClient.invalidateQueries({ queryKey: auctionKeys.all(auctionId) })
      }
    },
  })

  const quoting = useMutation({
    mutationFn: (v: { unit_price: string; shipping_cost: string; signature: string }) =>
      quoteReverseOffer(auctionId, {
        unit_price: v.unit_price,
        shipping_cost: v.shipping_cost,
      }).then((q) => ({ ...q, signature: v.signature })),
    onSuccess: (q) => {
      if (q.within_maximum) setQuote(q)
      else {
        setQuote(null)
        setClientError(
          `El total oficial ${formatMoney(q.total)} supera el máximo ${formatMoney(q.maximum_allowed)}.`,
        )
        void queryClient.invalidateQueries({ queryKey: auctionKeys.all(auctionId) })
      }
    },
  })

  const unitOk = isValidUnitPriceInput(unitPrice)
  const shipOk = isValidAmountInput(shipping)
  const total = unitOk && shipOk ? reverseTotal(unitPrice, quantity, shipping) : null
  const aboveMax = total && maximumAllowed ? toCents(total) > toCents(maximumAllowed) : false

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setClientError(null)
    if (!unitOk) {
      setClientError('Precio unitario no válido: hasta 4 decimales (ej. 24.5000).')
      return
    }
    if (!shipOk) {
      setClientError('Costo de envío no válido: hasta 2 decimales (0 si no aplica).')
      return
    }
    if (aboveMax && maximumAllowed) {
      setClientError(`El total no puede superar ${formatMoney(maximumAllowed)}.`)
      return
    }
    const body = { unit_price: unitPrice.trim(), shipping_cost: normalizeAmount(shipping) }
    const signature = `${orgId}|${body.unit_price}|${body.shipping_cost}`
    if (quote?.signature !== signature) {
      // Paso 1: el servidor confirma el total oficial antes de enviar la oferta.
      setResult(null)
      quoting.mutate({ ...body, signature })
      return
    }
    const key = attempt.current?.signature === signature ? attempt.current.key : newIdempotencyKey()
    attempt.current = { signature, key }
    setResult(null)
    mutation.mutate({ ...body, key })
  }

  const currentSignature =
    unitOk && shipOk ? `${orgId}|${unitPrice.trim()}|${normalizeAmount(shipping)}` : null
  const confirmed = quote && quote.signature === currentSignature ? quote : null

  const serverMax =
    isApiError(mutation.error) && mutation.error.code === 'OFFER_ABOVE_MAXIMUM'
      ? String(mutation.error.details['maximum_allowed'] ?? '')
      : null

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      {organizations.length > 1 && (
        <div className="space-y-1.5">
          <Label htmlFor="offer-org">Ofertar como</Label>
          <NativeSelect id="offer-org" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.legal_name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="offer-unit">Precio unitario</Label>
          <Input
            id="offer-unit"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.0000"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            disabled={mutation.isPending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="offer-shipping">Envío</Label>
          <Input
            id="offer-shipping"
            inputMode="decimal"
            autoComplete="off"
            value={shipping}
            onChange={(e) => setShipping(e.target.value)}
            disabled={mutation.isPending}
          />
        </div>
      </div>
      <p className="text-sm" aria-live="polite">
        Total: <strong className="tabular-nums">{total ? formatMoney(total) : '—'}</strong>
        {maximumAllowed && (
          <span className="text-muted-foreground"> · máximo {formatMoney(maximumAllowed)}</span>
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        Total = precio unitario × {quantity} + envío, redondeado a centavos. Lo calcula el servidor.
      </p>
      {clientError && <p className="text-xs text-destructive">{clientError}</p>}
      {confirmed && (
        <Alert>
          Total oficial calculado por el servidor:{' '}
          <strong className="tabular-nums">{formatMoney(confirmed.total)}</strong>. Confirma para
          enviar la oferta.
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={mutation.isPending || quoting.isPending}>
        {mutation.isPending
          ? 'Enviando…'
          : quoting.isPending
            ? 'Calculando…'
            : confirmed
              ? `Confirmar oferta de ${formatMoney(confirmed.total)}`
              : 'Revisar oferta'}
      </Button>
      {quoting.isError && <ErrorAlert error={quoting.error} title="No se pudo calcular el total" />}
      {mutation.isError && (
        <ErrorAlert
          error={mutation.error}
          title={
            serverMax
              ? `Ahora el máximo es ${formatMoney(serverMax)}`
              : isApiError(mutation.error) && mutation.error.code === 'ALREADY_LEADING'
                ? 'Tu organización ya tiene la mejor oferta'
                : undefined
          }
        />
      )}
      {result?.bid && version <= result.auction.version && (
        <Alert variant="success">
          Oferta de {formatMoney(result.bid.amount)} aceptada. Tu organización tiene la mejor
          oferta.
        </Alert>
      )}
    </form>
  )
}
