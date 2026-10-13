/**
 * Reloj del servidor (ADR-0004: la hora de negocio es la de PostgreSQL).
 *
 * Guardamos el desfase `hora del servidor − reloj local` y lo usamos para las cuentas
 * regresivas. La fuente precisa es `server_time` de la API (detalle, live, /auth/me);
 * mientras no llegue ninguno, la cabecera HTTP `Date` (precisión de 1 s) sirve de respaldo.
 */
import { useSyncExternalStore } from 'react'

import { onApiResponse } from '@/api/client'

let offsetMs = 0
let precise = false
const listeners = new Set<() => void>()

function setOffset(next: number, isPrecise: boolean) {
  if (!isPrecise && precise) return
  precise = precise || isPrecise
  if (Math.abs(next - offsetMs) < 250) return // sin cambios perceptibles: no re-renderizar
  offsetMs = next
  for (const l of listeners) l()
}

/** Sincroniza con un `server_time` recibido ahora mismo. */
export function syncServerTime(
  serverTimeIso: string | null | undefined,
  receivedAtMs = Date.now(),
) {
  if (!serverTimeIso) return
  const server = Date.parse(serverTimeIso)
  if (Number.isFinite(server)) setOffset(server - receivedAtMs, true)
}

export function syncFromDateHeader(dateHeader: string | null, receivedAtMs = Date.now()) {
  if (!dateHeader) return
  const server = Date.parse(dateHeader)
  if (Number.isFinite(server)) setOffset(server + 500 - receivedAtMs, false)
}

/** Hora actual según el servidor, en ms. */
export function serverNow(): number {
  return Date.now() + offsetMs
}

export function getServerOffset(): number {
  return offsetMs
}

export function subscribeServerClock(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useServerOffset(): number {
  return useSyncExternalStore(subscribeServerClock, getServerOffset, getServerOffset)
}

/** Solo para pruebas. */
export function resetServerClock() {
  offsetMs = 0
  precise = false
}

onApiResponse((res) => syncFromDateHeader(res.headers.get('Date')))
