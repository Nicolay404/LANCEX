/**
 * Dinero en el frontend: siempre `string` decimal (`"125.00"`), como en el contrato.
 * Este módulo solo FORMATEA para mostrar; el backend es la autoridad sobre importes.
 */
import type { Money } from '@/api/types'

const DECIMAL_RE = /^-?\d+(\.\d+)?$/

const usd = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' })

export function isMoneyString(value: unknown): value is Money {
  return typeof value === 'string' && DECIMAL_RE.test(value)
}

/** `"1234.5"` → `"$1.234,50"` (formato es-EC). Devuelve `"—"` si no es un importe válido. */
export function formatMoney(value: Money | null | undefined): string {
  if (!isMoneyString(value)) return '—'
  return usd.format(Number(value))
}
