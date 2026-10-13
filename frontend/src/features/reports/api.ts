import { api } from '@/api/client'
import type { Uuid } from '@/api/types'

export type ReportTarget = 'auction' | 'listing' | 'user'
export type ReportReason = 'fraud' | 'prohibited_item' | 'misleading' | 'other'

export const REPORT_REASONS: { value: ReportReason; label: string; hint: string }[] = [
  {
    value: 'fraud',
    label: 'Fraude o estafa',
    hint: 'Intento de engaño, pagos por fuera, suplantación.',
  },
  {
    value: 'prohibited_item',
    label: 'Artículo prohibido',
    hint: 'Está en la lista de artículos no permitidos.',
  },
  {
    value: 'misleading',
    label: 'Información engañosa',
    hint: 'Fotos o descripción que no corresponden.',
  },
  { value: 'other', label: 'Otro motivo', hint: 'Cuéntanos qué pasa en el detalle.' },
]

export const DETAIL_MAX = 500

/** `POST /reports/` (REGLAS §14: 10 por día y uno por objeto). */
export const createReport = (input: {
  target_type: ReportTarget
  target_id: Uuid
  reason: ReportReason
  detail: string
}) => api.post<{ id: Uuid; status: string }>('/reports/', input)
