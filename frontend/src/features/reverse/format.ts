/** Fecha `YYYY-MM-DD` del contrato → `13/11/2026` sin conversiones de zona horaria. */
export function formatDate(value: string): string {
  const [y, m, d] = value.split('-')
  return y && m && d ? `${d}/${m}/${y}` : value
}

/** `"100.000"` → `"100"`; `"2.500"` → `"2,5"` (solo presentación). */
export function formatQuantity(value: string): string {
  const [int = '0', dec = ''] = value.split('.')
  const trimmed = dec.replace(/0+$/, '')
  return trimmed ? `${int},${trimmed}` : int
}
