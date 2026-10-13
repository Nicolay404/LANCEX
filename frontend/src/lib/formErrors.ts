import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'

import { isApiError } from '@/api/errors'

/**
 * Lleva `details.fields` de un `VALIDATION_ERROR` a los campos del formulario.
 * Devuelve los mensajes de campos que el formulario no tiene (para mostrarlos arriba).
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  formFields: readonly Path<T>[],
): string[] {
  if (!isApiError(error)) return []
  const fields = error.fieldErrors
  if (!fields) return []
  const leftovers: string[] = []
  for (const [name, value] of Object.entries(fields)) {
    const message = Array.isArray(value) ? value.map(String).join(' ') : String(value)
    if ((formFields as readonly string[]).includes(name)) {
      setError(name as Path<T>, { type: 'server', message })
    } else {
      leftovers.push(message)
    }
  }
  return leftovers
}

/** Mensajes de `details.fields` que no corresponden a ningún campo del formulario (sin efectos). */
export function leftoverFieldErrors(error: unknown, formFields: readonly string[]): string[] {
  if (!isApiError(error) || !error.fieldErrors) return []
  return Object.entries(error.fieldErrors)
    .filter(([name]) => !formFields.includes(name))
    .map(([, value]) => (Array.isArray(value) ? value.map(String).join(' ') : String(value)))
}
