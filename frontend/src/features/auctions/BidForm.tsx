import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'

import { newIdempotencyKey } from '@/api/client'
import { isApiError } from '@/api/errors'
import type { Money } from '@/api/types'
import { ErrorAlert } from '@/components/ErrorAlert'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMoney, isValidAmountInput, normalizeAmount, toCents } from '@/lib/money'

import { auctionKeys, placeBid } from './api'
import type { BidAccepted } from './types'

/** Errores tras los que repetir es seguro con la MISMA clave (el servidor deduplica). */
const RETRYABLE = new Set(['NETWORK_ERROR', 'INTERNAL_ERROR', 'INVALID_RESPONSE'])

/**
 * Puja manual ascendente. El backend es la autoridad sobre importe, estado y cierre;
 * aquí solo se ayuda al usuario. Cada intento lógico lleva un `Idempotency-Key` nuevo y un
 * reintento tras fallo de red reutiliza el mismo (CONTRATO §Convenciones).
 */
export function BidForm({
  auctionId,
  minimumNextBid,
  currentPrice,
  version,
}: {
  auctionId: string
  minimumNextBid: Money | null
  currentPrice: Money | null
  /** Versión actual (de `live/`): si avanzó desde la puja, el aviso ya no es vigente. */
  version: number
}) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [clientError, setClientError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<BidAccepted | null>(null)
  const attempt = useRef<{ amount: string; key: string } | null>(null)

  const mutation = useMutation({
    mutationFn: ({ value, key }: { value: string; key: string }) => placeBid(auctionId, value, key),
    onSuccess: (data) => {
      attempt.current = null
      setResult(data)
      setAmount('')
      void queryClient.invalidateQueries({ queryKey: auctionKeys.all(auctionId) })
    },
    onError: (error) => {
      if (!(isApiError(error) && RETRYABLE.has(error.code))) attempt.current = null
      if (isApiError(error) && error.code === 'BID_BELOW_MINIMUM') {
        void queryClient.invalidateQueries({ queryKey: auctionKeys.all(auctionId) })
      }
    },
  })

  const value = amount.trim() || minimumNextBid || ''

  const send = () => {
    const normalized = normalizeAmount(value)
    const reuse = attempt.current?.amount === normalized ? attempt.current.key : null
    const key = reuse ?? newIdempotencyKey()
    attempt.current = { amount: normalized, key }
    setConfirming(false)
    setResult(null)
    mutation.mutate({ value: normalized, key })
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setClientError(null)
    if (!isValidAmountInput(value)) {
      setClientError('Escribe un importe válido, con hasta 2 decimales (ej. 150.00).')
      return
    }
    if (minimumNextBid && toCents(value) < toCents(minimumNextBid)) {
      setClientError(`La puja mínima es ${formatMoney(minimumNextBid)}.`)
      return
    }
    // PANTALLAS §3: confirmación si la puja supera 3 veces el precio actual.
    if (currentPrice && toCents(value) > toCents(currentPrice) * 3n) {
      setConfirming(true)
      return
    }
    send()
  }

  const minimumAllowed =
    isApiError(mutation.error) && mutation.error.code === 'BID_BELOW_MINIMUM'
      ? String(mutation.error.details['minimum_allowed'] ?? '')
      : null

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="bid-amount">Tu puja (USD)</Label>
        <div className="flex gap-2">
          <Input
            id="bid-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder={minimumNextBid ?? '0.00'}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setConfirming(false)
            }}
            aria-invalid={!!clientError}
            aria-describedby="bid-help"
            disabled={mutation.isPending}
          />
          <Button type="submit" disabled={mutation.isPending || confirming}>
            {mutation.isPending ? 'Enviando…' : 'Pujar'}
          </Button>
        </div>
        <p id="bid-help" className="text-xs text-muted-foreground">
          {minimumNextBid ? `Mínimo ${formatMoney(minimumNextBid)}.` : null} Si lo dejas vacío se
          usa el mínimo.
        </p>
        {clientError && <p className="text-xs text-destructive">{clientError}</p>}
      </div>

      {confirming && (
        <Alert>
          <p>
            Vas a pujar {formatMoney(normalizeAmount(value))}, más de 3 veces el precio actual.
            ¿Confirmas?
          </p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={send}>
              Sí, pujar
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </Alert>
      )}

      {mutation.isError && (
        <ErrorAlert
          error={mutation.error}
          title={minimumAllowed ? `Ahora el mínimo es ${formatMoney(minimumAllowed)}` : undefined}
        />
      )}

      {result && result.bid && version <= result.auction.version && (
        <Alert variant={result.outbid_by_proxy ? 'default' : 'success'}>
          {result.outbid_by_proxy
            ? `Tu puja de ${formatMoney(result.bid.amount)} se registró, pero una puja automática de otro postor la superó al instante.`
            : `Puja de ${formatMoney(result.bid.amount)} aceptada. ${result.auction.viewer_is_leader ? 'Vas ganando.' : ''}`}
        </Alert>
      )}
    </form>
  )
}
