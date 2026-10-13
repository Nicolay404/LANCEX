import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { isApiError } from '@/api/errors'
import type { UserOrganization } from '@/api/types'
import { ErrorAlert } from '@/components/ErrorAlert'
import { FormField } from '@/components/FormField'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createProcurementRequest } from '@/features/reverse/api'
import type { Requirement } from '@/features/reverse/types'
import { toGuayaquilInput } from '@/lib/dates'
import { serverNow } from '@/lib/serverClock'

const QUANTITY_RE = /^\d{1,12}(\.\d{1,3})?$/
const CODE_RE = /^[A-Za-z0-9_-]{1,10}$/
const MAX_REQUIREMENTS = 20

type Field =
  | 'title'
  | 'specifications'
  | 'quantity'
  | 'unit'
  | 'delivery_deadline'
  | 'delivery_location'
  | 'mandatory_requirements'

/** Mensajes de `details.fields` (pueden venir anidados por requisito). */
function messagesOf(value: unknown): string[] {
  if (value == null) return []
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(messagesOf)
  if (typeof value === 'object') return Object.values(value).flatMap(messagesOf)
  return [String(value)]
}

/** `/org/:orgId/compras/necesidades/nueva` (capacidad `procurement.manage`). */
export function NewNeedPage({ org }: { org: UserOrganization }) {
  const navigate = useNavigate()
  const today = toGuayaquilInput(serverNow()).slice(0, 10)
  const [v, setV] = useState({
    title: '',
    specifications: '',
    quantity: '',
    unit: '',
    delivery_deadline: '',
    delivery_location: '',
  })
  const [reqs, setReqs] = useState<Requirement[]>([])
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})

  const mutation = useMutation({
    mutationFn: createProcurementRequest,
    onSuccess: (need) =>
      void navigate(`/org/${org.id}/compras/necesidades/${need.id}`, {
        state: { created: true },
      }),
  })

  const server = isApiError(mutation.error) ? mutation.error.fieldErrors : null
  const err = (f: Field) => errors[f] ?? (server?.[f] ? messagesOf(server[f]).join(' ') : undefined)
  const set = (k: keyof typeof v) => (value: string) => setV((s) => ({ ...s, [k]: value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!v.title.trim()) next.title = 'Escribe un título.'
    if (!v.specifications.trim()) next.specifications = 'Describe lo que necesitas.'
    if (!QUANTITY_RE.test(v.quantity.trim()) || Number(v.quantity) <= 0)
      next.quantity = 'Mayor que 0 y con hasta 3 decimales.'
    if (!v.unit.trim()) next.unit = 'Indica la unidad (caja, kg, servicio…).'
    if (!v.delivery_deadline) next.delivery_deadline = 'Indica la fecha límite.'
    else if (v.delivery_deadline < today) next.delivery_deadline = 'No puede estar en el pasado.'
    if (!v.delivery_location.trim()) next.delivery_location = 'Indica el lugar de entrega.'
    const codes = reqs.map((r) => r.code.trim())
    if (
      reqs.some((r) => !CODE_RE.test(r.code.trim()) || r.description.trim().length < 3) ||
      new Set(codes).size !== codes.length
    )
      next.mandatory_requirements =
        'Cada requisito necesita un código único (letras, números, - o _, máx. 10) y una descripción de al menos 3 caracteres.'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    mutation.mutate({
      organization_id: org.id,
      title: v.title.trim(),
      specifications: v.specifications.trim(),
      quantity: v.quantity.trim(),
      unit: v.unit.trim(),
      delivery_deadline: v.delivery_deadline,
      delivery_location: v.delivery_location.trim(),
      mandatory_requirements: reqs.map((r) => ({
        code: r.code.trim(),
        description: r.description.trim(),
      })),
    })
  }

  const generalError =
    mutation.isError && !(isApiError(mutation.error) && mutation.error.code === 'VALIDATION_ERROR')

  return (
    <section className="space-y-4">
      <Link to={`/org/${org.id}/compras`} className="text-sm text-muted-foreground hover:underline">
        ← Compras
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Publicar necesidad</h1>
      <p className="text-sm text-muted-foreground">
        La necesidad es pública: los proveedores la leen para decidir si se inscriben.
      </p>
      <form onSubmit={submit} noValidate className="max-w-2xl space-y-4">
        {generalError && <ErrorAlert error={mutation.error} />}
        <FormField label="Título" error={err('title')}>
          {(p) => (
            <Input
              {...p}
              maxLength={120}
              value={v.title}
              onChange={(e) => set('title')(e.target.value)}
            />
          )}
        </FormField>
        <FormField label="Especificaciones" error={err('specifications')}>
          {(p) => (
            <Textarea
              {...p}
              rows={5}
              maxLength={5000}
              value={v.specifications}
              onChange={(e) => set('specifications')(e.target.value)}
            />
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Cantidad" hint="Hasta 3 decimales." error={err('quantity')}>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={v.quantity}
                onChange={(e) => set('quantity')(e.target.value)}
              />
            )}
          </FormField>
          <FormField label="Unidad" error={err('unit')}>
            {(p) => (
              <Input
                {...p}
                maxLength={20}
                value={v.unit}
                onChange={(e) => set('unit')(e.target.value)}
              />
            )}
          </FormField>
          <FormField label="Entrega hasta" error={err('delivery_deadline')}>
            {(p) => (
              <Input
                {...p}
                type="date"
                min={today}
                value={v.delivery_deadline}
                onChange={(e) => set('delivery_deadline')(e.target.value)}
              />
            )}
          </FormField>
          <FormField label="Lugar de entrega" error={err('delivery_location')}>
            {(p) => (
              <Input
                {...p}
                maxLength={120}
                value={v.delivery_location}
                onChange={(e) => set('delivery_location')(e.target.value)}
              />
            )}
          </FormField>
        </div>

        <fieldset className="space-y-3 rounded-xl border p-4">
          <legend className="px-1 text-sm font-medium">Requisitos obligatorios</legend>
          <p className="text-xs text-muted-foreground">
            Cada proveedor declara si cumple cada uno al inscribirse.
          </p>
          {reqs.map((r, i) => (
            <div key={i} className="grid grid-cols-[6rem_1fr_auto] items-end gap-2">
              <FormField label={`Código ${i + 1}`}>
                {(p) => (
                  <Input
                    {...p}
                    maxLength={10}
                    value={r.code}
                    onChange={(e) =>
                      setReqs(reqs.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))
                    }
                  />
                )}
              </FormField>
              <FormField label={`Descripción ${i + 1}`}>
                {(p) => (
                  <Input
                    {...p}
                    maxLength={300}
                    value={r.description}
                    onChange={(e) =>
                      setReqs(
                        reqs.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                      )
                    }
                  />
                )}
              </FormField>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Quitar requisito ${i + 1}`}
                onClick={() => setReqs(reqs.filter((_, j) => j !== i))}
              >
                Quitar
              </Button>
            </div>
          ))}
          {err('mandatory_requirements') && (
            <p className="text-xs text-destructive">{err('mandatory_requirements')}</p>
          )}
          {reqs.length < MAX_REQUIREMENTS && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReqs([...reqs, { code: `R${reqs.length + 1}`, description: '' }])}
            >
              Agregar requisito
            </Button>
          )}
        </fieldset>
        {server && Object.keys(errors).length === 0 && mutation.isError && (
          <Alert variant="destructive">Revisa los campos marcados.</Alert>
        )}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Publicando…' : 'Publicar necesidad'}
        </Button>
      </form>
    </section>
  )
}
