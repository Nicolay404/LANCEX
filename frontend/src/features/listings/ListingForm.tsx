import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { isApiError } from '@/api/errors'
import { ErrorAlert } from '@/components/ErrorAlert'
import { FormErrorBanner } from '@/components/FormErrorBanner'
import { FormField } from '@/components/FormField'
import { PageLoading } from '@/components/PageLoading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { applyServerFieldErrors, leftoverFieldErrors } from '@/lib/formErrors'

import { fetchCategories, listingKeys } from './api'
import {
  CITY_MAX,
  DESCRIPTION_MAX,
  EMPTY_LISTING_FORM,
  listingSchema,
  TITLE_MAX,
  type ListingFormValues,
} from './schema'
import { type Category, ITEM_CONDITION_LABEL, ITEM_CONDITIONS, LISTING_FIELDS } from './types'

export interface ListingFormProps {
  initialValues?: ListingFormValues
  submitLabel: string
  pendingLabel: string
  /** Recibe los valores y los nombres de los campos modificados. */
  onSubmit: (values: ListingFormValues, dirty: (keyof ListingFormValues)[]) => void
  pending: boolean
  error: unknown
  disabled?: boolean
  /** Para edición: sin cambios, el botón queda deshabilitado. */
  requireChanges?: boolean
}

export function ListingForm(props: ListingFormProps) {
  const categories = useQuery({
    queryKey: listingKeys.categories,
    queryFn: ({ signal }) => fetchCategories(signal),
    staleTime: 5 * 60_000,
  })
  // El <select> necesita sus opciones antes de recibir el valor inicial: sin categorías no hay formulario.
  if (categories.isPending) return <PageLoading label="Cargando categorías…" />
  if (categories.isError) {
    return (
      <div className="max-w-2xl space-y-3">
        <ErrorAlert error={categories.error} title="No se pudieron cargar las categorías" />
        <Button variant="outline" onClick={() => void categories.refetch()}>
          Reintentar
        </Button>
      </div>
    )
  }
  return <ListingFormFields categories={categories.data} {...props} />
}

function ListingFormFields({
  categories,
  initialValues = EMPTY_LISTING_FORM,
  submitLabel,
  pendingLabel,
  onSubmit,
  pending,
  error,
  disabled = false,
  requireChanges = false,
}: ListingFormProps & { categories: Category[] }) {
  const form = useForm<ListingFormValues>({
    resolver: zodResolver(listingSchema),
    values: initialValues,
    resetOptions: { keepDirtyValues: true },
  })
  // Errores del backend por campo junto a cada input (category_id, title, ...).
  useEffect(() => {
    applyServerFieldErrors(error, form.setError, LISTING_FIELDS)
  }, [error, form.setError])
  const extraErrors = leftoverFieldErrors(error, LISTING_FIELDS)

  const submit = form.handleSubmit((values) => {
    const dirty = Object.keys(form.formState.dirtyFields) as (keyof ListingFormValues)[]
    onSubmit(values, dirty)
  })

  const { errors, isDirty } = form.formState
  const descriptionLength = useWatch({ control: form.control, name: 'description' }).length
  const locked = disabled || pending
  const fieldErrorsShownInline = isApiError(error) && error.code === 'VALIDATION_ERROR'

  return (
    <form onSubmit={submit} noValidate className="max-w-2xl space-y-5">
      {fieldErrorsShownInline ? (
        <FormErrorBanner error={error} extraErrors={extraErrors} />
      ) : (
        <ErrorAlert error={error} />
      )}

      <FormField label="Título" error={errors.title?.message}>
        {(a11y) => (
          <Input maxLength={TITLE_MAX} disabled={locked} {...a11y} {...form.register('title')} />
        )}
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Categoría" error={errors.category_id?.message}>
          {(a11y) => (
            <NativeSelect disabled={locked} {...a11y} {...form.register('category_id')}>
              <option value="">Elige una categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>

        <FormField label="Estado del artículo" error={errors.item_condition?.message}>
          {(a11y) => (
            <NativeSelect disabled={locked} {...a11y} {...form.register('item_condition')}>
              <option value="">Elige el estado</option>
              {ITEM_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {ITEM_CONDITION_LABEL[c]}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>

      <FormField
        label="Descripción"
        error={errors.description?.message}
        hint={`Texto plano, sin HTML ni enlaces. ${descriptionLength}/${DESCRIPTION_MAX}`}
      >
        {(a11y) => (
          <Textarea
            rows={8}
            maxLength={DESCRIPTION_MAX}
            disabled={locked}
            {...a11y}
            {...form.register('description')}
          />
        )}
      </FormField>

      <FormField label="Ciudad" error={errors.location_city?.message}>
        {(a11y) => (
          <Input
            maxLength={CITY_MAX}
            autoComplete="address-level2"
            disabled={locked}
            {...a11y}
            {...form.register('location_city')}
          />
        )}
      </FormField>

      {!disabled && (
        <Button type="submit" disabled={pending || (requireChanges && !isDirty)}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      )}
    </form>
  )
}
