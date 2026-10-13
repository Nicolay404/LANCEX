/**
 * Asistente de creación de subasta (LX-28). Las reglas replican las del dominio
 * (ascending.py, sealed.py, soft_close.py, candle.py, registry.validate_schedule) solo como
 * ayuda: el backend vuelve a validar todo al crear y al publicar.
 */
import { z } from 'zod'

import type { Uuid } from '@/api/types'
import { fromGuayaquilInput } from '@/lib/dates'
import { isValidAmountInput, normalizeAmount, toCents } from '@/lib/money'
import { serverNow } from '@/lib/serverClock'

import type { AuctionCreateInput } from '../api'

export const MIN_DURATION_MS = 2 * 60_000
export const MAX_DURATION_MS = 30 * 24 * 60 * 60_000
export const SOFT_WINDOW_MIN = { min: 0.5, max: 10 } // 30–600 s
export const SOFT_MAX_TOTAL_MIN = { min: 0.5, max: 1440 } // 30 s – 24 h
export const CANDLE_WINDOW_MIN = { min: 5, max: 60 } // 300–3600 s

const amount = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => isValidAmountInput(v), `${label}: importe con hasta 2 decimales.`)

const minutes = (label: string, b: { min: number; max: number }) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d)?$/.test(v) && Number(v) >= b.min && Number(v) <= b.max, {
      message: `${label}: entre ${b.min} y ${b.max} minutos.`,
    })

export const wizardSchema = z
  .object({
    mechanism: z.enum(['ascending', 'sealed']),
    starting_price: amount('Precio'),
    min_increment: z.string().trim(),
    reserve_price: z.string().trim(),
    proxy_enabled: z.boolean(),
    start_mode: z.enum(['on_publish', 'scheduled']),
    starts_at: z.string(),
    ends_at: z
      .string()
      .refine((v) => fromGuayaquilInput(v) !== null, 'Indica fecha y hora de cierre.'),
    closing_policy: z.enum(['fixed', 'soft_close', 'candle']),
    soft_window_min: z.string(),
    soft_extension_min: z.string(),
    soft_max_total_min: z.string(),
    candle_window_min: z.string(),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message })
    const ascending = v.mechanism === 'ascending'

    if (isValidAmountInput(v.starting_price) && toCents(v.starting_price) < 100n) {
      issue('starting_price', 'Debe ser al menos $1,00.')
    }
    if (ascending) {
      if (!isValidAmountInput(v.min_increment) || toCents(v.min_increment) < 1n) {
        issue('min_increment', 'Indica un incremento de al menos $0,01.')
      }
    }
    if (v.reserve_price) {
      if (!isValidAmountInput(v.reserve_price))
        issue('reserve_price', 'Importe con hasta 2 decimales.')
      else if (
        isValidAmountInput(v.starting_price) &&
        toCents(v.reserve_price) < toCents(v.starting_price)
      ) {
        issue('reserve_price', 'No puede ser menor que el precio inicial.')
      }
    }
    if (!ascending && v.closing_policy !== 'fixed') {
      issue('closing_policy', 'El sobre cerrado solo admite cierre fijo.')
    }

    const start = startMs(v)
    const end = fromGuayaquilInput(v.ends_at)
    if (v.start_mode === 'scheduled' && start === null)
      issue('starts_at', 'Indica fecha y hora de inicio.')
    if (start !== null && end !== null) {
      const duration = Date.parse(end) - start
      if (duration < MIN_DURATION_MS) issue('ends_at', 'La subasta debe durar al menos 2 minutos.')
      if (duration > MAX_DURATION_MS) issue('ends_at', 'La subasta no puede durar más de 30 días.')
      if (v.closing_policy === 'candle' && Number(v.candle_window_min) * 60_000 > duration) {
        issue('candle_window_min', 'La ventana de vela no puede ser mayor que la subasta.')
      }
    }
    if (v.closing_policy === 'soft_close') {
      for (const [field, label, b] of [
        ['soft_window_min', 'Ventana', SOFT_WINDOW_MIN],
        ['soft_extension_min', 'Extensión', SOFT_WINDOW_MIN],
        ['soft_max_total_min', 'Extensión total', SOFT_MAX_TOTAL_MIN],
      ] as const) {
        const r = minutes(label, b).safeParse(v[field])
        if (!r.success) issue(field, r.error.issues[0]?.message ?? 'Valor inválido.')
      }
    }
    if (v.closing_policy === 'candle') {
      const r = minutes('Ventana de vela', CANDLE_WINDOW_MIN).safeParse(v.candle_window_min)
      if (!r.success) issue('candle_window_min', r.error.issues[0]?.message ?? 'Valor inválido.')
    }
  })

export type WizardValues = z.infer<typeof wizardSchema>

/** Inicio en ms: "al publicar" = ahora según el SERVIDOR (el backend lo reajusta al publicar). */
export function startMs(v: Pick<WizardValues, 'start_mode' | 'starts_at'>): number | null {
  if (v.start_mode === 'on_publish') return serverNow()
  const iso = fromGuayaquilInput(v.starts_at)
  return iso ? Date.parse(iso) : null
}

const toSeconds = (min: string) => Math.round(Number(min) * 60)

export function buildCreatePayload(v: WizardValues, listingId: Uuid): AuctionCreateInput {
  const ascending = v.mechanism === 'ascending'
  const start = startMs(v) ?? serverNow()
  const payload: AuctionCreateInput = {
    mechanism: v.mechanism,
    closing_policy: ascending ? v.closing_policy : 'fixed',
    proxy_enabled: ascending && v.proxy_enabled,
    listing_id: listingId,
    starting_price: normalizeAmount(v.starting_price),
    reserve_price: v.reserve_price ? normalizeAmount(v.reserve_price) : null,
    starts_at: new Date(start).toISOString(),
    ends_at: fromGuayaquilInput(v.ends_at) ?? '',
  }
  if (ascending) payload.min_increment = normalizeAmount(v.min_increment)
  if (payload.closing_policy === 'soft_close') {
    payload.soft_close_window_s = toSeconds(v.soft_window_min)
    payload.soft_close_extension_s = toSeconds(v.soft_extension_min)
    payload.soft_close_max_total_s = toSeconds(v.soft_max_total_min)
  }
  if (payload.closing_policy === 'candle') payload.candle_window_s = toSeconds(v.candle_window_min)
  return payload
}

/** Campo del backend → campo del formulario y paso del asistente donde corregirlo. */
export const SERVER_FIELD_MAP: Record<string, { field: keyof WizardValues; step: number }> = {
  mechanism: { field: 'mechanism', step: 1 },
  starting_price: { field: 'starting_price', step: 1 },
  min_increment: { field: 'min_increment', step: 1 },
  reserve_price: { field: 'reserve_price', step: 1 },
  proxy_enabled: { field: 'proxy_enabled', step: 1 },
  starts_at: { field: 'starts_at', step: 2 },
  ends_at: { field: 'ends_at', step: 2 },
  closing_policy: { field: 'closing_policy', step: 2 },
  soft_close_window_s: { field: 'soft_window_min', step: 2 },
  soft_close_extension_s: { field: 'soft_extension_min', step: 2 },
  soft_close_max_total_s: { field: 'soft_max_total_min', step: 2 },
  candle_window_s: { field: 'candle_window_min', step: 2 },
}

/** Campos que se validan al pasar de cada paso. */
export const STEP_FIELDS: Record<number, (keyof WizardValues)[]> = {
  1: ['mechanism', 'starting_price', 'min_increment', 'reserve_price', 'proxy_enabled'],
  2: [
    'start_mode',
    'starts_at',
    'ends_at',
    'closing_policy',
    'soft_window_min',
    'soft_extension_min',
    'soft_max_total_min',
    'candle_window_min',
  ],
}
