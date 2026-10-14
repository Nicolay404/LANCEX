import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { isApiError } from '@/api/errors'
import type { Money } from '@/api/types'
import { ErrorAlert } from '@/components/ErrorAlert'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMoney, isValidAmountInput, normalizeAmount, toCents } from '@/lib/money'

import { auctionKeys, fetchProxyLimit, proxyKey, setProxyLimit, type ProxyLimitResult } from './api'

/**
 * Puja automática (REGLAS §3): el usuario fija un máximo SECRETO y el sistema puja por él lo
 * mínimo necesario. Solo se muestra y se pide el máximo propio; nunca el de otros (LX-36).
 */
export function ProxyLimitPanel({
  auctionId,
  minimumNextBid,
  isLeader,
}: {
  auctionId: string
  minimumNextBid: Money | null
  isLeader: boolean
}) {
  const queryClient = useQueryClient()
  const own = useQuery({
    queryKey: proxyKey(auctionId),
    queryFn: ({ signal }) => fetchProxyLimit(auctionId, signal),
  })
  const [amount, setAmount] = useState('')
  const [clientError, setClientError] = useState<string | null>(null)
  const [result, setResult] = useState<ProxyLimitResult | null>(null)

  const mutation = useMutation({
    mutationFn: (value: string) => setProxyLimit(auctionId, value),
    onSuccess: (data) => {
      setResult(data)
      setAmount('')
      queryClient.setQueryData(proxyKey(auctionId), {
        max_amount: data.max_amount,
        status: data.status,
        is_leader: data.is_leader,
      })
      void queryClient.invalidateQueries({ queryKey: auctionKeys.all(auctionId) })
    },
  })

  const current = own.data?.status === 'active' ? own.data.max_amount : null

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setClientError(null)
    setResult(null)
    const value = amount.trim()
    if (!isValidAmountInput(value)) {
      setClientError('Escribe un importe válido, con hasta 2 decimales.')
      return
    }
    if (current && toCents(value) <= toCents(current)) {
      setClientError(`Solo puedes subir tu máximo: debe ser mayor que ${formatMoney(current)}.`)
      return
    }
    if (!isLeader && minimumNextBid && toCents(value) < toCents(minimumNextBid)) {
      setClientError(`Tu máximo debe ser al menos ${formatMoney(minimumNextBid)}.`)
      return
    }
    mutation.mutate(normalizeAmount(value))
  }

  const minimumAllowed =
    isApiError(mutation.error) && mutation.error.code === 'BID_BELOW_MINIMUM'
      ? String(mutation.error.details['minimum_allowed'] ?? '')
      : null

  return (
    <section className="space-y-3 border-t pt-4" aria-labelledby="proxy-title">
      <h2 id="proxy-title" className="text-sm font-medium">
        Puja automática
      </h2>
      <p className="text-xs text-muted-foreground">
        Fija el máximo que estás dispuesto a pagar. El sistema pujará por ti solo lo necesario para
        mantenerte primero, hasta ese máximo. Nadie más lo ve y solo puedes subirlo.
      </p>
      {current && (
        <p className="text-sm">
          Tu máximo actual: <strong className="tabular-nums">{formatMoney(current)}</strong>
        </p>
      )}
      {own.data?.status === 'exhausted' && (
        <p className="text-sm text-amber-300">
          Tu máximo anterior fue superado. Puedes fijar uno nuevo.
        </p>
      )}
      <form onSubmit={onSubmit} noValidate className="space-y-2">
        <Label htmlFor="proxy-amount">
          {current ? 'Subir mi máximo a (USD)' : 'Mi máximo (USD)'}
        </Label>
        <div className="flex gap-2">
          <Input
            id="proxy-amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!clientError}
            disabled={mutation.isPending}
          />
          <Button type="submit" variant="secondary" disabled={mutation.isPending || !amount.trim()}>
            {mutation.isPending ? 'Guardando…' : current ? 'Subir' : 'Fijar'}
          </Button>
        </div>
        {clientError && <p className="text-xs text-destructive">{clientError}</p>}
      </form>
      {mutation.isError && (
        <ErrorAlert
          error={mutation.error}
          title={minimumAllowed ? `El mínimo ahora es ${formatMoney(minimumAllowed)}` : undefined}
        />
      )}
      {result && <ProxyOutcome result={result} />}
    </section>
  )
}

function ProxyOutcome({ result }: { result: ProxyLimitResult }) {
  if (result.outbid_by_proxy) {
    return (
      <Alert>
        Otro postor tenía un máximo mayor y te superó al instante. Precio actual{' '}
        {formatMoney(result.auction.current_price)}. Puedes subir tu máximo.
      </Alert>
    )
  }
  if (!result.bid) {
    return (
      <Alert variant="success">
        Máximo subido a {formatMoney(result.max_amount)}. Sigues ganando.
      </Alert>
    )
  }
  return (
    <Alert variant="success">
      Máximo de {formatMoney(result.max_amount)} activo. Vas ganando con{' '}
      {formatMoney(result.bid.amount)}.
    </Alert>
  )
}
