import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'

import { isApiError } from '@/api/errors'
import type { UserOrganization } from '@/api/types'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { ErrorAlert } from '@/components/ErrorAlert'
import { FormErrorBanner } from '@/components/FormErrorBanner'
import { FormField } from '@/components/FormField'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { publishAuction } from '@/features/auctions/api'
import { createReverseAuction, fetchProcurementRequest, reverseKeys } from '@/features/reverse/api'
import { NeedSummary } from '@/features/reverse/NeedSummary'
import type { ProcurementRequest, ReverseAuctionInput } from '@/features/reverse/types'
import { fromGuayaquilInput, toGuayaquilInput } from '@/lib/dates'
import { leftoverFieldErrors } from '@/lib/formErrors'
import { isValidAmountInput, normalizeAmount, toCents } from '@/lib/money'
import { serverNow } from '@/lib/serverClock'

/** `/org/:orgId/compras/necesidades/:needId`: ficha + crear la subasta inversa sobre ella. */
export function NeedPage({ org }: { org: UserOrganization }) {
  const { needId = '' } = useParams()
  const location = useLocation()
  const created = (location.state as { created?: boolean } | null)?.created
  const need = useQuery({
    queryKey: reverseKeys.procurement(needId),
    queryFn: ({ signal }) => fetchProcurementRequest(needId, signal),
  })
  if (need.isPending) return <PageLoading />
  if (need.isError) {
    if (isApiError(need.error) && need.error.status === 404) return <NotFoundPage />
    return <ErrorAlert error={need.error} />
  }
  // Una necesidad de otra organización no se gestiona desde aquí.
  if (need.data.buyer_organization.id !== org.id) return <NotFoundPage />

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
      <section className="space-y-4">
        <Link
          to={`/org/${org.id}/compras`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Compras
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{need.data.title}</h1>
        {created && (
          <Alert variant="success">
            Necesidad publicada. Ahora crea la subasta inversa para recibir ofertas.
          </Alert>
        )}
        <NeedSummary need={need.data} />
      </section>
      <aside className="lg:sticky lg:top-4 lg:self-start">
        {need.data.auction ? (
          <div className="space-y-3 rounded-xl border bg-card p-5 shadow-xs">
            <h2 className="font-medium">Subasta inversa</h2>
            <p className="text-sm text-muted-foreground">
              Esta necesidad ya tiene su subasta ({need.data.auction.admitted_count} proveedores
              admitidos).
            </p>
            <Button asChild className="w-full">
              <Link to={`/subastas/${need.data.auction.id}`}>Ver subasta</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to={`/org/${org.id}/compras/subastas/${need.data.auction.id}/calificacion`}>
                Calificación de proveedores
              </Link>
            </Button>
          </div>
        ) : (
          <CreateReverseAuction org={org} need={need.data} />
        )}
      </aside>
    </div>
  )
}

const FIELDS = [
  'reference_budget',
  'min_decrement',
  'closing_policy',
  'starts_at',
  'ends_at',
  'procurement_request_id',
] as const
type Field = (typeof FIELDS)[number]

const MIN_DURATION_MS = 2 * 60_000
const MAX_DURATION_MS = 30 * 24 * 60 * 60_000

function defaults() {
  const start = Math.ceil((serverNow() + 24 * 60 * 60_000) / 300_000) * 300_000
  return {
    reference_budget: '',
    min_decrement: '1.00',
    closing_policy: 'fixed' as 'fixed' | 'soft_close',
    starts_at: toGuayaquilInput(start),
    ends_at: toGuayaquilInput(start + 2 * 60 * 60_000),
    publish: true,
  }
}

function CreateReverseAuction({ org, need }: { org: UserOrganization; need: ProcurementRequest }) {
  const navigate = useNavigate()
  const [v, setV] = useState(defaults)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})

  const mutation = useMutation({
    mutationFn: async (input: ReverseAuctionInput) => {
      const draft = await createReverseAuction(input)
      if (!v.publish) return { id: draft.id, created: 'draft', publishError: null }
      try {
        await publishAuction(draft.id)
        return { id: draft.id, created: 'published', publishError: null }
      } catch (e) {
        // El borrador ya existe: se informa y el dueño puede publicarlo desde el detalle.
        const message = isApiError(e) ? e.message : 'Error inesperado.'
        return { id: draft.id, created: 'draft', publishError: message }
      }
    },
    onSuccess: ({ id, created, publishError }) =>
      void navigate(`/subastas/${id}`, { state: { created, publishError } }),
  })

  const server = isApiError(mutation.error) ? mutation.error.fieldErrors : null
  const err = (f: Field) => {
    const s = server?.[f]
    return errors[f] ?? (s ? (Array.isArray(s) ? s.map(String).join(' ') : String(s)) : undefined)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!isValidAmountInput(v.reference_budget) || toCents(v.reference_budget) < 1n)
      next.reference_budget = 'Importe mayor que 0, con hasta 2 decimales.'
    if (!isValidAmountInput(v.min_decrement) || toCents(v.min_decrement) < 1n)
      next.min_decrement = 'Al menos 0.01.'
    const start = fromGuayaquilInput(v.starts_at)
    const end = fromGuayaquilInput(v.ends_at)
    const startMs = start ? Date.parse(start) : NaN
    const endMs = end ? Date.parse(end) : NaN
    if (Number.isNaN(startMs)) next.starts_at = 'Indica el inicio.'
    else if (startMs <= serverNow())
      next.starts_at = 'Debe ser futuro: la inscripción y calificación ocurren antes del inicio.'
    if (Number.isNaN(endMs)) next.ends_at = 'Indica el fin.'
    else if (!Number.isNaN(startMs) && endMs - startMs < MIN_DURATION_MS)
      next.ends_at = 'Debe durar al menos 2 minutos.'
    else if (!Number.isNaN(startMs) && endMs - startMs > MAX_DURATION_MS)
      next.ends_at = 'No puede durar más de 30 días.'
    setErrors(next)
    if (Object.keys(next).length > 0 || !start || !end) return

    const input: ReverseAuctionInput = {
      mechanism: 'reverse',
      closing_policy: v.closing_policy,
      proxy_enabled: false,
      organization_id: org.id,
      procurement_request_id: need.id,
      reference_budget: normalizeAmount(v.reference_budget),
      min_decrement: normalizeAmount(v.min_decrement),
      starts_at: start,
      ends_at: end,
    }
    if (v.closing_policy === 'soft_close') {
      input.soft_close_window_s = 120
      input.soft_close_extension_s = 120
      input.soft_close_max_total_s = 3600
    }
    mutation.mutate(input)
  }

  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) =>
    setV((s) => ({ ...s, [k]: value }))

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-4 rounded-xl border bg-card p-5 shadow-xs"
    >
      <h2 className="font-medium">Crear subasta inversa</h2>
      <FormErrorBanner
        error={mutation.error}
        extraErrors={leftoverFieldErrors(mutation.error, FIELDS)}
      />
      {err('procurement_request_id') && (
        <p className="text-xs text-destructive">{err('procurement_request_id')}</p>
      )}
      <FormField
        label="Presupuesto referencial (USD)"
        hint="Total máximo que aceptas. Los proveedores lo ven."
        error={err('reference_budget')}
      >
        {(p) => (
          <Input
            {...p}
            inputMode="decimal"
            value={v.reference_budget}
            onChange={(e) => set('reference_budget', e.target.value)}
          />
        )}
      </FormField>
      <FormField
        label="Decremento mínimo (USD)"
        hint="Cada oferta nueva debe bajar al menos esto."
        error={err('min_decrement')}
      >
        {(p) => (
          <Input
            {...p}
            inputMode="decimal"
            value={v.min_decrement}
            onChange={(e) => set('min_decrement', e.target.value)}
          />
        )}
      </FormField>
      <FormField label="Cierre" error={err('closing_policy')}>
        {(p) => (
          <NativeSelect
            {...p}
            value={v.closing_policy}
            onChange={(e) => set('closing_policy', e.target.value as 'fixed' | 'soft_close')}
          >
            <option value="fixed">Hora fija</option>
            <option value="soft_close">Con extensión (2 min, máx. 60 min)</option>
          </NativeSelect>
        )}
      </FormField>
      <FormField label="Inicio (hora de Ecuador)" error={err('starts_at')}>
        {(p) => (
          <Input
            {...p}
            type="datetime-local"
            value={v.starts_at}
            onChange={(e) => set('starts_at', e.target.value)}
          />
        )}
      </FormField>
      <FormField label="Fin (hora de Ecuador)" error={err('ends_at')}>
        {(p) => (
          <Input
            {...p}
            type="datetime-local"
            value={v.ends_at}
            onChange={(e) => set('ends_at', e.target.value)}
          />
        )}
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={v.publish}
          onChange={(e) => set('publish', e.target.checked)}
        />
        Publicar al crear (abre la inscripción de proveedores)
      </label>
      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creando…' : v.publish ? 'Crear y publicar' : 'Guardar borrador'}
      </Button>
    </form>
  )
}
