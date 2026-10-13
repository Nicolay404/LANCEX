import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { isApiError } from '@/api/errors'
import { ErrorAlert } from '@/components/ErrorAlert'
import { FormField } from '@/components/FormField'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createAuction, publishAuction } from '@/features/auctions/api'
import { CLOSING_LABEL, MECHANISM_LABEL } from '@/features/auctions/labels'
import {
  buildCreatePayload,
  SERVER_FIELD_MAP,
  startMs,
  STEP_FIELDS,
  wizardSchema,
  type WizardValues,
} from '@/features/auctions/wizard/schema'
import { fetchListing, listingKeys } from '@/features/listings/api'
import type { Listing } from '@/features/listings/types'
import { formatDateTime, fromGuayaquilInput, toGuayaquilInput } from '@/lib/dates'
import { formatMoney, isValidAmountInput, normalizeAmount } from '@/lib/money'
import { serverNow } from '@/lib/serverClock'
import { cn } from '@/lib/utils'

const STEPS = ['Publicación', 'Reglas', 'Fechas y cierre', 'Revisión'] as const

function defaults(): WizardValues {
  // Cierre por defecto: mañana a esta hora, redondeado a 5 minutos (hora del servidor).
  const end = Math.ceil((serverNow() + 24 * 60 * 60_000) / 300_000) * 300_000
  return {
    mechanism: 'ascending',
    starting_price: '',
    min_increment: '1.00',
    reserve_price: '',
    proxy_enabled: false,
    start_mode: 'on_publish',
    starts_at: '',
    ends_at: toGuayaquilInput(end),
    closing_policy: 'fixed',
    soft_window_min: '2',
    soft_extension_min: '2',
    soft_max_total_min: '60',
    candle_window_min: '10',
  }
}

/** `/mis-subastas/nueva?listing=<id>` (capacidad `auction.create_personal`). */
export default function NewAuctionPage() {
  const [params] = useSearchParams()
  const listingId = params.get('listing') ?? ''

  const listing = useQuery({
    queryKey: listingKeys.detail(listingId),
    queryFn: ({ signal }) => fetchListing(listingId, signal),
    enabled: !!listingId,
  })

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <Link to="/mis-publicaciones" className="text-sm text-muted-foreground hover:underline">
          ← Mis publicaciones
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva subasta</h1>
      </header>
      {!listingId ? (
        <Alert>
          Una subasta se crea a partir de una de tus publicaciones. Abre la publicación y pulsa{' '}
          <strong>Crear subasta</strong>, o{' '}
          <Link to="/mis-publicaciones/nueva" className="underline underline-offset-4">
            crea una publicación nueva
          </Link>
          .
        </Alert>
      ) : listing.isPending ? (
        <PageLoading />
      ) : listing.isError ? (
        isApiError(listing.error) && listing.error.status === 404 ? (
          <Alert variant="destructive">La publicación no existe o no es tuya.</Alert>
        ) : (
          <ErrorAlert error={listing.error} />
        )
      ) : (
        <Wizard listing={listing.data} />
      )}
    </section>
  )
}

function Wizard({ listing }: { listing: Listing }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const form = useForm<WizardValues>({
    resolver: zodResolver(wizardSchema),
    defaultValues: defaults(),
    mode: 'onTouched',
  })

  const mutation = useMutation({
    mutationFn: async ({ publish }: { publish: boolean }) => {
      const created = await createAuction(buildCreatePayload(form.getValues(), listing.id))
      if (!publish) return { auction: created, published: false, publishError: null as unknown }
      try {
        return { auction: await publishAuction(created.id), published: true, publishError: null }
      } catch (publishError) {
        // El borrador ya existe: llevamos al usuario a él con el motivo.
        return { auction: created, published: false, publishError }
      }
    },
    onSuccess: ({ auction, published, publishError }) => {
      void navigate(`/subastas/${auction.id}`, {
        state: {
          created: published ? 'published' : 'draft',
          publishError: errorText(publishError),
        },
      })
    },
    onError: (error) => {
      // Errores por campo del backend: se marcan en su campo y se vuelve al primer paso afectado.
      if (isApiError(error) && error.fieldErrors) {
        let first = 3
        for (const [name, msgs] of Object.entries(error.fieldErrors)) {
          const target = SERVER_FIELD_MAP[name]
          if (!target) continue
          form.setError(target.field, { type: 'server', message: [msgs].flat().join(' ') })
          first = Math.min(first, target.step)
        }
        if (first < 3) setStep(first)
      }
    },
  })

  const next = async () => {
    const fields = STEP_FIELDS[step]
    if (fields && !(await form.trigger(fields))) return
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  if (!listing.editable) {
    return (
      <Alert variant="destructive">
        «{listing.title}» ya tiene una subasta en borrador, programada o activa. Solo puede tener
        una abierta a la vez.
      </Alert>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Pasos">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? 'step' : undefined}
            className={cn(
              'rounded-full border px-3 py-1',
              i === step && 'border-foreground bg-foreground text-background',
              i < step && 'text-muted-foreground',
            )}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <form noValidate onSubmit={(e) => e.preventDefault()} className="space-y-6">
        {step === 0 && <StepListing listing={listing} />}
        {step === 1 && <StepRules form={form} />}
        {step === 2 && <StepSchedule form={form} />}
        {step === 3 && <StepReview form={form} listing={listing} />}

        {mutation.isError &&
          !(isApiError(mutation.error) && mutation.error.fieldErrors && step < 3) && (
            <ErrorAlert error={mutation.error} title="No se pudo crear la subasta" />
          )}

        <div className="flex flex-wrap gap-2 border-t pt-4">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              disabled={mutation.isPending}
            >
              Atrás
            </Button>
          )}
          {step < 3 ? (
            <Button type="button" onClick={() => void next()}>
              Continuar
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => void form.handleSubmit(() => mutation.mutate({ publish: false }))()}
              >
                Guardar borrador
              </Button>
              <Button
                type="button"
                disabled={mutation.isPending}
                onClick={() => void form.handleSubmit(() => mutation.mutate({ publish: true }))()}
              >
                {mutation.isPending ? 'Enviando…' : 'Publicar ahora'}
              </Button>
            </>
          )}
        </div>
      </form>
    </div>
  )
}

function errorText(error: unknown): string | null {
  if (!error) return null
  return isApiError(error) ? error.message : 'Error inesperado al publicar.'
}

function StepListing({ listing }: { listing: Listing }) {
  return (
    <section className="space-y-2 rounded-xl border p-4">
      <h2 className="font-medium">{listing.title}</h2>
      <p className="text-sm text-muted-foreground">
        {listing.category.name} · {listing.location_city}
      </p>
      <p className="line-clamp-3 text-sm whitespace-pre-line">{listing.description}</p>
      <p className="text-xs text-muted-foreground">
        Este es el artículo que se subastará. Para cambiar sus datos, edítalo antes de publicar.
      </p>
    </section>
  )
}

function Choice({
  name,
  value,
  checked,
  onChange,
  title,
  children,
  disabled,
}: {
  name: string
  value: string
  checked: boolean
  onChange: (v: string) => void
  title: string
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer gap-3 rounded-lg border p-3 text-sm',
        checked && 'border-foreground ring-1 ring-foreground',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="mt-0.5"
      />
      <span>
        <span className="font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{children}</span>
      </span>
    </label>
  )
}

function StepRules({ form }: { form: UseFormReturn<WizardValues> }) {
  const mechanism = useWatch({ control: form.control, name: 'mechanism' })
  const { errors } = form.formState
  const setMechanism = (v: string) => {
    form.setValue('mechanism', v as WizardValues['mechanism'], { shouldDirty: true })
    if (v === 'sealed') {
      form.setValue('closing_policy', 'fixed')
      form.setValue('proxy_enabled', false)
    }
  }
  return (
    <section className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Modalidad</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice
            name="mechanism"
            value="ascending"
            checked={mechanism === 'ascending'}
            onChange={setMechanism}
            title="Ascendente"
          >
            Pujas públicas que suben; gana la más alta.
          </Choice>
          <Choice
            name="mechanism"
            value="sealed"
            checked={mechanism === 'sealed'}
            onChange={setMechanism}
            title="Sobre cerrado"
          >
            Cada postor envía una oferta secreta; se revelan al cierre.
          </Choice>
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label={mechanism === 'sealed' ? 'Oferta mínima (USD)' : 'Precio inicial (USD)'}
          error={errors.starting_price?.message}
        >
          {(a11y) => (
            <Input
              inputMode="decimal"
              placeholder="100.00"
              {...a11y}
              {...form.register('starting_price')}
            />
          )}
        </FormField>
        {mechanism === 'ascending' && (
          <FormField label="Incremento mínimo (USD)" error={errors.min_increment?.message}>
            {(a11y) => (
              <Input
                inputMode="decimal"
                placeholder="1.00"
                {...a11y}
                {...form.register('min_increment')}
              />
            )}
          </FormField>
        )}
        <FormField
          label="Precio de reserva (opcional)"
          error={errors.reserve_price?.message}
          hint="Si no se alcanza, no hay venta. Nadie más ve este valor."
        >
          {(a11y) => (
            <Input
              inputMode="decimal"
              placeholder="Sin reserva"
              {...a11y}
              {...form.register('reserve_price')}
            />
          )}
        </FormField>
      </div>

      {mechanism === 'ascending' && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4" {...form.register('proxy_enabled')} />
          <span>
            Permitir puja automática
            <span className="block text-xs text-muted-foreground">
              Los postores fijan un máximo secreto y el sistema puja por ellos lo mínimo necesario.
            </span>
          </span>
        </label>
      )}
    </section>
  )
}

function StepSchedule({ form }: { form: UseFormReturn<WizardValues> }) {
  const [mechanism, startMode, policy] = useWatch({
    control: form.control,
    name: ['mechanism', 'start_mode', 'closing_policy'],
  })
  const { errors } = form.formState
  const setPolicy = (v: string) =>
    form.setValue('closing_policy', v as WizardValues['closing_policy'], { shouldDirty: true })
  const ascending = mechanism === 'ascending'

  return (
    <section className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Inicio</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice
            name="start_mode"
            value="on_publish"
            checked={startMode === 'on_publish'}
            onChange={(v) => form.setValue('start_mode', v as 'on_publish')}
            title="Al publicar"
          >
            Empieza en cuanto la publiques.
          </Choice>
          <Choice
            name="start_mode"
            value="scheduled"
            checked={startMode === 'scheduled'}
            onChange={(v) => form.setValue('start_mode', v as 'scheduled')}
            title="Programada"
          >
            Elige fecha y hora de inicio.
          </Choice>
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        {startMode === 'scheduled' && (
          <FormField
            label="Fecha y hora de inicio"
            error={errors.starts_at?.message}
            hint="Hora de Ecuador (UTC−5)."
          >
            {(a11y) => <Input type="datetime-local" {...a11y} {...form.register('starts_at')} />}
          </FormField>
        )}
        <FormField
          label="Fecha y hora de cierre"
          error={errors.ends_at?.message}
          hint="Hora de Ecuador (UTC−5). Entre 2 minutos y 30 días."
        >
          {(a11y) => <Input type="datetime-local" {...a11y} {...form.register('ends_at')} />}
        </FormField>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Cierre</legend>
        {errors.closing_policy && (
          <p className="text-xs text-destructive">{errors.closing_policy.message}</p>
        )}
        <div className="grid gap-2">
          <Choice
            name="closing_policy"
            value="fixed"
            checked={policy === 'fixed'}
            onChange={setPolicy}
            title={CLOSING_LABEL.fixed}
          >
            Termina exactamente a la hora indicada.
          </Choice>
          <Choice
            name="closing_policy"
            value="soft_close"
            checked={policy === 'soft_close'}
            onChange={setPolicy}
            title={CLOSING_LABEL.soft_close}
            disabled={!ascending}
          >
            Una puja en los últimos minutos extiende el cierre (evita pujas de último segundo).
          </Choice>
          <Choice
            name="closing_policy"
            value="candle"
            checked={policy === 'candle'}
            onChange={setPolicy}
            title={CLOSING_LABEL.candle}
            disabled={!ascending}
          >
            El cierre real es un instante secreto dentro de una ventana final; se revela y verifica
            al terminar.
          </Choice>
        </div>
      </fieldset>

      {policy === 'soft_close' && (
        <div className="grid gap-5 sm:grid-cols-3">
          <FormField label="Ventana (min)" error={errors.soft_window_min?.message}>
            {(a11y) => (
              <Input inputMode="decimal" {...a11y} {...form.register('soft_window_min')} />
            )}
          </FormField>
          <FormField label="Extiende (min)" error={errors.soft_extension_min?.message}>
            {(a11y) => (
              <Input inputMode="decimal" {...a11y} {...form.register('soft_extension_min')} />
            )}
          </FormField>
          <FormField label="Extensión total máx. (min)" error={errors.soft_max_total_min?.message}>
            {(a11y) => (
              <Input inputMode="decimal" {...a11y} {...form.register('soft_max_total_min')} />
            )}
          </FormField>
        </div>
      )}
      {policy === 'candle' && (
        <FormField
          label="Ventana de vela (min)"
          error={errors.candle_window_min?.message}
          hint="Entre 5 y 60 minutos."
        >
          {(a11y) => (
            <Input
              inputMode="numeric"
              className="max-w-40"
              {...a11y}
              {...form.register('candle_window_min')}
            />
          )}
        </FormField>
      )}
    </section>
  )
}

function StepReview({ form, listing }: { form: UseFormReturn<WizardValues>; listing: Listing }) {
  const v = useWatch({ control: form.control }) as WizardValues
  const money = (x: string) => (isValidAmountInput(x) ? formatMoney(normalizeAmount(x)) : '—')
  const start = startMs(v)
  const rows: [string, string][] = [
    ['Artículo', listing.title],
    ['Modalidad', MECHANISM_LABEL[v.mechanism]],
    [v.mechanism === 'sealed' ? 'Oferta mínima' : 'Precio inicial', money(v.starting_price)],
  ]
  if (v.mechanism === 'ascending') rows.push(['Incremento mínimo', money(v.min_increment)])
  rows.push(['Precio de reserva', v.reserve_price ? money(v.reserve_price) : 'Sin reserva'])
  if (v.mechanism === 'ascending')
    rows.push(['Puja automática', v.proxy_enabled ? 'Permitida' : 'No'])
  rows.push(
    [
      'Inicio',
      v.start_mode === 'on_publish'
        ? 'Al publicar'
        : formatDateTime(start ? new Date(start).toISOString() : null),
    ],
    ['Cierre', formatDateTime(fromGuayaquilInput(v.ends_at))],
    ['Tipo de cierre', CLOSING_LABEL[v.closing_policy]],
  )
  if (v.closing_policy === 'soft_close') {
    rows.push([
      'Extensión',
      `${v.soft_window_min} min de ventana, +${v.soft_extension_min} min, hasta ${v.soft_max_total_min} min en total`,
    ])
  }
  if (v.closing_policy === 'candle') rows.push(['Ventana de vela', `${v.candle_window_min} min`])

  return (
    <section className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 rounded-xl border p-4 text-sm">
        {rows.map(([k, val]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{val}</dd>
          </div>
        ))}
      </dl>
      <Alert>
        Al publicar, las reglas quedan congeladas y no se pueden cambiar. Un borrador sí se puede
        revisar antes de publicarlo.
      </Alert>
    </section>
  )
}
