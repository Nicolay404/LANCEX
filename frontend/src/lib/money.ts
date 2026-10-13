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

const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/

/** Importe escrito por el usuario: solo dígitos y hasta 2 decimales (el backend revalida). */
export function isValidAmountInput(value: string): boolean {
  return AMOUNT_RE.test(value.trim())
}

/** `"12.5"` → `1250n`. Comparaciones de dinero sin flotantes (solo para UX). */
export function toCents(value: Money): bigint {
  const [int = '0', dec = ''] = value.trim().split('.')
  return BigInt(int) * 100n + BigInt((dec + '00').slice(0, 2))
}

/** Normaliza a 2 decimales: `"140"` → `"140.00"`. */
export function normalizeAmount(value: string): Money {
  const cents = toCents(value)
  const int = cents / 100n
  const dec = (cents % 100n).toString().padStart(2, '0')
  return `${int}.${dec}`
}

const UNIT_PRICE_RE = /^\d{1,10}(\.\d{1,4})?$/

/** Precio unitario de la inversa: hasta 4 decimales (REGLAS §7). */
export function isValidUnitPriceInput(value: string): boolean {
  return UNIT_PRICE_RE.test(value.trim())
}

/** Decimal en texto → entero escalado a `scale` decimales (sin flotantes). */
function toScaled(value: string, scale: number): bigint {
  const [int = '0', dec = ''] = value.trim().split('.')
  return (
    BigInt(int) * 10n ** BigInt(scale) + BigInt((dec + '0'.repeat(scale)).slice(0, scale) || '0')
  )
}

/**
 * Vista previa del total de una oferta inversa, igual que el servidor:
 * `ROUND_HALF_UP(unit_price × quantity + shipping_cost, 2)`. Solo UX: el backend lo recalcula.
 */
export function reverseTotal(unitPrice: string, quantity: string, shippingCost: string): Money {
  // unit (4 dec) × qty (3 dec) = 7 decimales; envío a 7 decimales también.
  const raw = toScaled(unitPrice, 4) * toScaled(quantity, 3) + toScaled(shippingCost, 2) * 100000n
  const cents = (raw + 50000n) / 100000n // ROUND_HALF_UP (valores no negativos)
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`
}
