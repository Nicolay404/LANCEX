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
