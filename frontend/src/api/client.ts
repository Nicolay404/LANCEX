/**
 * Cliente HTTP propio sobre `fetch` (ADR-0004: sin Axios).
 *
 * - Solo rutas relativas a la base de la API: todo pasa por el proxy de Vite (mismo origen).
 * - Métodos mutables: cabecera `X-CSRFToken`; si falta la cookie se pide `/auth/csrf/` primero.
 * - Ante `CSRF_FAILED` renueva el token y reintenta UNA vez, con la misma `Idempotency-Key`.
 * - `Idempotency-Key` la decide quien llama (una por intento lógico; los reintentos la reutilizan).
 * - Errores siempre como `ApiError` tipado; nunca se registra el cuerpo en consola.
 */

import { ApiError, fallbackCode, isApiErrorBody } from './errors'
import { CSRF_HEADER_NAME, getCsrfToken } from './csrf'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type QueryValue = string | number | boolean | null | undefined
export type QueryParams = Record<string, QueryValue | readonly QueryValue[]>

export interface RequestOptions {
  method?: HttpMethod
  /** Se serializa como JSON. `undefined` = sin cuerpo. */
  body?: unknown
  query?: QueryParams
  /** UUID v4 para pujas y ofertas. Generarlo con `newIdempotencyKey()`. */
  idempotencyKey?: string
  /** ETag recibido antes; habilita `304` en endpoints como `live/`. */
  ifNoneMatch?: string | null
  signal?: AbortSignal
}

export type ConditionalResult<T> =
  { notModified: true; etag: string | null } | { notModified: false; data: T; etag: string | null }

const MUTATING: ReadonlySet<HttpMethod> = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export const API_BASE: string = normalizeBase(import.meta.env.VITE_API_BASE ?? '/api/v1')

function normalizeBase(base: string): string {
  const trimmed = base.replace(/\/+$/, '')
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    // Una base absoluta enviaría la cookie de sesión y el token CSRF a otro origen.
    throw new Error('VITE_API_BASE debe ser una ruta relativa, por ejemplo /api/v1')
  }
  return trimmed
}

export function buildUrl(path: string, query?: QueryParams): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    throw new Error(`Ruta de API inválida: ${path}`)
  }
  const url = new URL(API_BASE + path, 'http://lancex.invalid')
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      const values = Array.isArray(value) ? value : [value]
      for (const v of values) {
        if (v !== undefined && v !== null) url.searchParams.append(key, String(v))
      }
    }
  }
  return url.pathname + url.search
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

// --- Observadores de respuesta ---------------------------------------------------------

type ResponseObserver = (res: Response) => void
const responseObservers = new Set<ResponseObserver>()

/** Permite a otros módulos leer cabeceras (p. ej. `Date` para el reloj del servidor). */
export function onApiResponse(observer: ResponseObserver): () => void {
  responseObservers.add(observer)
  return () => responseObservers.delete(observer)
}

// --- CSRF -------------------------------------------------------------------------------

let csrfInFlight: Promise<void> | null = null

/** Pide `/auth/csrf/` (una sola petición aunque la llamen varios a la vez). */
export function refreshCsrfToken(): Promise<void> {
  csrfInFlight ??= (async () => {
    try {
      const res = await rawFetch(buildUrl('/auth/csrf/'), { method: 'GET' })
      if (!res.ok) throw await toApiError(res)
    } finally {
      csrfInFlight = null
    }
  })()
  return csrfInFlight
}

async function ensureCsrfToken(): Promise<string> {
  let token = getCsrfToken()
  if (!token) {
    await refreshCsrfToken()
    token = getCsrfToken()
  }
  if (!token) {
    throw new ApiError({
      status: 403,
      code: 'CSRF_FAILED',
      message: 'No se pudo obtener el token CSRF.',
    })
  }
  return token
}

// --- Núcleo -----------------------------------------------------------------------------

async function rawFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    const res = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
    })
    for (const observer of responseObservers) observer(res)
    return res
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'No se pudo conectar con el servidor.',
    })
  }
}

async function send(path: string, opts: RequestOptions, isRetry: boolean): Promise<Response> {
  const method = opts.method ?? 'GET'
  const headers = new Headers({ Accept: 'application/json' })

  if (opts.body !== undefined) headers.set('Content-Type', 'application/json')
  if (opts.idempotencyKey) headers.set('Idempotency-Key', opts.idempotencyKey)
  if (opts.ifNoneMatch) headers.set('If-None-Match', opts.ifNoneMatch)
  if (MUTATING.has(method)) headers.set(CSRF_HEADER_NAME, await ensureCsrfToken())

  const res = await rawFetch(buildUrl(path, opts.query), {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
  })

  if (res.status === 403 && MUTATING.has(method) && !isRetry) {
    const error = await toApiError(res.clone())
    if (error.code === 'CSRF_FAILED') {
      await refreshCsrfToken()
      return send(path, opts, true)
    }
  }
  return res
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ApiError({
      status: res.status,
      code: 'INVALID_RESPONSE',
      message: 'La respuesta del servidor no es JSON válido.',
      requestId: res.headers.get('X-Request-ID'),
    })
  }
}

export async function toApiError(res: Response): Promise<ApiError> {
  const headerRequestId = res.headers.get('X-Request-ID')
  let body: unknown
  try {
    body = await readJson(res)
  } catch {
    body = undefined
  }
  if (isApiErrorBody(body)) {
    return new ApiError({
      status: res.status,
      code: body.code,
      message: body.message,
      details: body.details ?? {},
      requestId: body.request_id ?? headerRequestId,
    })
  }
  return new ApiError({
    status: res.status,
    code: fallbackCode(res.status),
    message: `Error ${res.status} del servidor.`,
    requestId: headerRequestId,
  })
}

/** Petición normal. Devuelve el JSON tipado o `undefined` en `204`. */
export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, opts, false)
  if (!res.ok) throw await toApiError(res)
  if (res.status === 204) return undefined as T
  return (await readJson(res)) as T
}

/** Petición condicional con ETag (polling de `live/`, ADR-0004 §4). */
export async function apiFetchConditional<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<ConditionalResult<T>> {
  const res = await send(path, opts, false)
  const etag = res.headers.get('ETag')
  if (res.status === 304) return { notModified: true, etag: etag ?? opts.ifNoneMatch ?? null }
  if (!res.ok) throw await toApiError(res)
  return { notModified: false, data: (await readJson(res)) as T, etag }
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...opts, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T = void>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...opts, method: 'DELETE' }),
}
