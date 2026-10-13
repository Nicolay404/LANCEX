import { isApiError } from '@/api/errors'
import { Alert } from '@/components/ui/alert'

/** Error de la API con su `request_id` visible para soporte (PANTALLAS-Y-NAVEGACION §1). */
export function ErrorAlert({ error, title }: { error: unknown; title?: string }) {
  if (!error) return null
  const message = isApiError(error)
    ? errorMessage(error.code, error.message, error.details)
    : 'Ocurrió un error inesperado.'
  const requestId = isApiError(error) ? error.requestId : null
  return (
    <Alert variant="destructive">
      {title && <p className="font-medium">{title}</p>}
      <p>{message}</p>
      {requestId && <p className="mt-1 text-xs opacity-80">Código de soporte: {requestId}</p>}
    </Alert>
  )
}

function errorMessage(code: string, message: string, details: Record<string, unknown>): string {
  if (code === 'NETWORK_ERROR') return 'No se pudo conectar con el servidor. Revisa tu conexión.'
  if (code === 'RATE_LIMITED') {
    const s = Number(details['retry_after_s'])
    if (Number.isFinite(s) && s > 0) {
      const minutes = Math.ceil(s / 60)
      return `Demasiados intentos. Vuelve a intentarlo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`
    }
    return 'Demasiados intentos. Espera un momento y vuelve a intentarlo.'
  }
  if (code === 'INTERNAL_ERROR') return 'Error del servidor. Intenta de nuevo más tarde.'
  return message
}
