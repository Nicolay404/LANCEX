import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'

import { newIdempotencyKey } from '@/api/client'
import { isApiError } from '@/api/errors'
import type { Money } from '@/api/types'
import { ErrorAlert } from '@/components/ErrorAlert'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDateTime } from '@/lib/dates'
import { formatMoney, isValidAmountInput, normalizeAmount, toCents } from '@/lib/money'

import {
  auctionKeys,
  fetchSealedOffer,
  putSealedOffer,
  sealedKey,
  withdrawSealedOffer,
} from './api'

const RETRYABLE = new Set(['NETWORK_ERROR', 'INTERNAL_ERROR', 'INVALID_RESPONSE'])

/**
 * Oferta sellada propia (REGLAS §6). Nunca se muestra nada ajeno: ni importes, ni quién va
 * ganando; solo la propia oferta y el número de participantes.
 */
export function SealedOfferPanel({
  auctionId,
  minimum,
}: {
  auctionId: string
  minimum: Money | null
}) {
  const queryClient = useQueryClient()
  const own = useQuery({
    queryKey: sealedKey(auctionId),
    queryFn: ({ signal }) => fetchSealedOffer(auctionId, signal),
  })
  const [amount, setAmount] = useState('')
  const [clientError, setClientError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<'replace' | 'withdraw' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const attempt = useRef<{ amount: string; key: string } | null>(null)

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: sealedKey(auctionId) })
    void queryClient.invalidateQueries({ queryKey: auctionKeys.all(auctionId) })
  }
  const submit = useMutation({
    mutationFn: ({ value, key }: { value: string; key: string }) =>
      putSealedOffer(auctionId, value, key),
    onSuccess: (data, { value }) => {
      attempt.current = null
      queryClient.setQueryData(sealedKey(auctionId), data)
      setAmount('')
      setNotice(`Oferta de ${formatMoney(value)} registrada. Nadie más puede verla.`)
      refresh()
    },
    onError: (error) => {
      if (!(isApiError(error) && RETRYABLE.has(error.code))) attempt.current = null
    },
  })
  const withdraw = useMutation({
    mutationFn: () => withdrawSealedOffer(auctionId),
    onSuccess: () => {
      setNotice('Retiraste tu oferta. Puedes enviar otra hasta el cierre.')
      refresh()
    },
  })

  const current = own.data?.amount ?? null
  const busy = submit.isPending || withdraw.isPending

  const send = () => {
    const value = normalizeAmount(amount.trim())
    const key = attempt.current?.amount === value ? attempt.current.key : newIdempotencyKey()
    attempt.current = { amount: value, key }
    setConfirming(null)
    setNotice(null)
    submit.mutate({ value, key })
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setClientError(null)
    const value = amount.trim()
    if (!isValidAmountInput(value))
      return setClientError('Escribe un importe válido, con hasta 2 decimales.')
    if (minimum && toCents(value) < toCents(minimum)) {
      return setClientError(`La oferta mínima es ${formatMoney(minimum)}.`)
    }
    if (current) return setConfirming('replace') // avisar que pierde prioridad en empates
    send()
  }

  return (
    <section className="space-y-3" aria-labelledby="sealed-title">
      <h2 id="sealed-title" className="text-sm font-medium">
        Tu oferta sellada
      </h2>
      <p className="text-xs text-muted-foreground">
        Envías una sola oferta secreta: nadie la ve, ni el vendedor, hasta el cierre. Gana la más
        alta; en empate, la que se envió primero.
      </p>

      {current ? (
        <div className="rounded-lg border p-3 text-sm">
          <p>
            Oferta vigente: <strong className="tabular-nums">{formatMoney(current)}</strong>
          </p>
          <p className="text-xs text-muted-foreground">
            Enviada {formatDateTime(own.data?.submitted_at)}
          </p>
        </div>
      ) : (
        own.isSuccess && (
          <p className="text-sm text-muted-foreground">Todavía no enviaste una oferta.</p>
        )
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-2">
        <Label htmlFor="sealed-amount">
          {current ? 'Reemplazar por (USD)' : 'Tu oferta (USD)'}
        </Label>
        <div className="flex gap-2">
          <Input
            id="sealed-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder={minimum ?? '0.00'}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setConfirming(null)
            }}
            aria-invalid={!!clientError}
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !amount.trim() || confirming !== null}>
            {submit.isPending ? 'Enviando…' : current ? 'Reemplazar' : 'Ofertar'}
          </Button>
        </div>
        {minimum && (
          <p className="text-xs text-muted-foreground">Oferta mínima {formatMoney(minimum)}.</p>
        )}
        {clientError && <p className="text-xs text-destructive">{clientError}</p>}
      </form>

      {confirming === 'replace' && (
        <Alert>
          <p>
            Vas a reemplazar tu oferta por {formatMoney(normalizeAmount(amount))}. La nueva cuenta
            como enviada ahora: <strong>pierdes prioridad si hay empate</strong>. ¿Continuar?
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={send}>
              Sí, reemplazar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(null)}>
              Cancelar
            </Button>
          </div>
        </Alert>
      )}

      {current && confirming !== 'withdraw' && (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 text-muted-foreground"
          disabled={busy}
          onClick={() => setConfirming('withdraw')}
        >
          Retirar mi oferta
        </Button>
      )}
      {confirming === 'withdraw' && (
        <Alert>
          <p>
            ¿Retirar tu oferta de {formatMoney(current)}? Dejarás de participar salvo que envíes
            otra.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={withdraw.isPending}
              onClick={() => {
                setConfirming(null)
                setNotice(null)
                withdraw.mutate()
              }}
            >
              Sí, retirar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(null)}>
              Cancelar
            </Button>
          </div>
        </Alert>
      )}

      {submit.isError && <ErrorAlert error={submit.error} title="No se pudo enviar la oferta" />}
      {withdraw.isError && (
        <ErrorAlert error={withdraw.error} title="No se pudo retirar la oferta" />
      )}
      {notice && <Alert variant="success">{notice}</Alert>}
    </section>
  )
}
