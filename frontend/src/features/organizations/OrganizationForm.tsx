import { useState, type FormEvent } from 'react'

import { isApiError } from '@/api/errors'
import { FormErrorBanner } from '@/components/FormErrorBanner'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { leftoverFieldErrors } from '@/lib/formErrors'

import { LEGAL_NAME_MAX, LEGAL_NAME_MIN, RUC_RE, type OrganizationInput } from './types'

const FIELDS = ['legal_name', 'ruc', 'is_buyer', 'is_supplier'] as const

/** Alta y edición del perfil de una organización. El backend revalida todo. */
export function OrganizationForm({
  initial,
  submitLabel,
  pendingLabel,
  pending,
  error,
  onSubmit,
}: {
  initial?: OrganizationInput
  submitLabel: string
  pendingLabel: string
  pending: boolean
  error: unknown
  onSubmit: (values: OrganizationInput) => void
}) {
  const [values, setValues] = useState<OrganizationInput>(
    initial ?? { legal_name: '', ruc: '', is_buyer: true, is_supplier: false },
  )
  const [errors, setErrors] = useState<Partial<Record<(typeof FIELDS)[number], string>>>({})

  const server = isApiError(error) ? error.fieldErrors : undefined
  const fieldError = (name: (typeof FIELDS)[number]) => {
    const v = errors[name] ?? server?.[name]
    return v === undefined ? undefined : Array.isArray(v) ? v.map(String).join(' ') : String(v)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    const name = values.legal_name.trim()
    if (name.length < LEGAL_NAME_MIN || name.length > LEGAL_NAME_MAX)
      next.legal_name = `Entre ${LEGAL_NAME_MIN} y ${LEGAL_NAME_MAX} caracteres.`
    if (!RUC_RE.test(values.ruc.trim())) next.ruc = 'El RUC debe tener 13 dígitos.'
    if (!values.is_buyer && !values.is_supplier)
      next.is_buyer = 'Elige compradora, proveedora o ambas.'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    onSubmit({ ...values, legal_name: name, ruc: values.ruc.trim() })
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-xl space-y-4">
      <FormErrorBanner error={error} extraErrors={leftoverFieldErrors(error, FIELDS)} />
      <FormField label="Razón social" error={fieldError('legal_name')}>
        {(p) => (
          <Input
            {...p}
            maxLength={LEGAL_NAME_MAX}
            value={values.legal_name}
            onChange={(e) => setValues({ ...values, legal_name: e.target.value })}
          />
        )}
      </FormField>
      <FormField label="RUC" hint="13 dígitos." error={fieldError('ruc')}>
        {(p) => (
          <Input
            {...p}
            inputMode="numeric"
            maxLength={13}
            value={values.ruc}
            onChange={(e) => setValues({ ...values, ruc: e.target.value })}
          />
        )}
      </FormField>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Tipo de organización</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.is_buyer}
            onChange={(e) => setValues({ ...values, is_buyer: e.target.checked })}
          />
          Compradora (publica necesidades y subastas inversas)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.is_supplier}
            onChange={(e) => setValues({ ...values, is_supplier: e.target.checked })}
          />
          Proveedora (se inscribe y oferta en subastas inversas)
        </label>
        {fieldError('is_buyer') && (
          <p className="text-xs text-destructive">{fieldError('is_buyer')}</p>
        )}
      </fieldset>
      <Button type="submit" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  )
}
