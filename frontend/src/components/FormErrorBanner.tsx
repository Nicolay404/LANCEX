import { isApiError } from '@/api/errors'
import { ErrorAlert } from '@/components/ErrorAlert'
import { Alert } from '@/components/ui/alert'

/**
 * Banner de error de un formulario. Un `VALIDATION_ERROR` cuyos campos ya se muestran
 * junto a cada input no repite el banner; los campos sin input sí se listan.
 */
export function FormErrorBanner({
  error,
  extraErrors = [],
}: {
  error: unknown
  extraErrors?: string[]
}) {
  if (!error) return null
  const fieldOnly = isApiError(error) && error.code === 'VALIDATION_ERROR' && error.fieldErrors
  if (fieldOnly) {
    if (extraErrors.length === 0) return null
    return (
      <Alert variant="destructive">
        <ul className="list-inside list-disc">
          {extraErrors.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </Alert>
    )
  }
  return <ErrorAlert error={error} />
}
