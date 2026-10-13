/** Fechas mostradas en America/Guayaquil (PANTALLAS-Y-NAVEGACION §1). Solo para mostrar. */
const dateTime = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateTime.format(d)
}

/*
 * Entradas `datetime-local` en hora de Ecuador continental (UTC−05:00, sin horario de verano).
 * El usuario escribe hora local de Guayaquil aunque su laptop tenga otra zona; al backend
 * siempre va ISO-8601 con offset explícito.
 */
const GYE_OFFSET_MS = -5 * 60 * 60 * 1000

/** ms epoch → `"YYYY-MM-DDTHH:mm"` en hora de Guayaquil. */
export function toGuayaquilInput(ms: number): string {
  return new Date(ms + GYE_OFFSET_MS).toISOString().slice(0, 16)
}

/** `"YYYY-MM-DDTHH:mm"` (hora de Guayaquil) → `"YYYY-MM-DDTHH:mm:00-05:00"`, o null si no es válido. */
export function fromGuayaquilInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const iso = `${value}:00-05:00`
  return Number.isFinite(Date.parse(iso)) ? iso : null
}
