import { useState } from 'react'

import { Alert } from '@/components/ui/alert'
import { formatDateTime } from '@/lib/dates'

/**
 * Aviso de cierre extendido (soft close, REGLAS §4): si mientras miras la subasta llega un
 * `ends_at` posterior por `live/`, se avisa con la nueva hora. La cuenta regresiva ya usa el valor nuevo.
 */
export function ExtensionNotice({ endsAt }: { endsAt: string | null }) {
  const [seen, setSeen] = useState(endsAt)
  const [extension, setExtension] = useState<{ from: string; to: string } | null>(null)

  if (endsAt !== seen) {
    // Patrón "ajustar estado al cambiar una prop" de React (sin efecto).
    if (seen && endsAt && Date.parse(endsAt) > Date.parse(seen))
      setExtension({ from: seen, to: endsAt })
    setSeen(endsAt)
  }
  if (!extension) return null
  const minutes = Math.max(
    1,
    Math.round((Date.parse(extension.to) - Date.parse(extension.from)) / 60_000),
  )
  return (
    <Alert
      role="status"
      className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
    >
      ¡Cierre extendido {minutes} min por una puja de último momento! Ahora termina{' '}
      {formatDateTime(extension.to)}.
    </Alert>
  )
}
