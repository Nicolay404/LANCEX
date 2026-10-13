import { describe, expect, it, vi } from 'vitest'

import { api, apiFetch, apiFetchConditional, buildUrl, newIdempotencyKey } from './client'
import { ApiError } from './errors'

type Call = { url: string; init: RequestInit; headers: Headers }

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function errorBody(code: string, message = 'msg', details: Record<string, unknown> = {}) {
  return { code, message, details, request_id: 'req-123' }
}

function setCsrfCookie(value: string) {
  document.cookie = `csrftoken=${value}; path=/`
}

/** Mock de fetch: `handler` decide la respuesta; `/auth/csrf/` fija la cookie como Django. */
function mockFetch(handler: (call: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { url: String(input), init, headers: new Headers(init.headers) }
    calls.push(call)
    return handler(call, calls.length)
  })
  vi.stubGlobal('fetch', fn)
  return { fn, calls }
}

describe('buildUrl', () => {
  it('antepone la base relativa y serializa la query omitiendo vacíos', () => {
    expect(buildUrl('/auctions/', { status: 'active', q: undefined, page: 2, x: null })).toBe(
      '/api/v1/auctions/?status=active&page=2',
    )
  })

  it('rechaza URLs absolutas o protocol-relative (no filtrar cookie ni CSRF a otro origen)', () => {
    expect(() => buildUrl('https://evil.example/x')).toThrow()
    expect(() => buildUrl('//evil.example/x')).toThrow()
    expect(() => buildUrl('auctions/')).toThrow()
  })
})

describe('apiFetch: GET', () => {
  it('no envía X-CSRFToken ni pide /auth/csrf/ y usa la misma sesión', async () => {
    const { calls } = mockFetch(() => json(200, { ok: true }))
    const data = await api.get<{ ok: boolean }>('/auth/me/')

    expect(data).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('/api/v1/auth/me/')
    expect(calls[0]!.init.credentials).toBe('same-origin')
    expect(calls[0]!.headers.get('X-CSRFToken')).toBeNull()
    expect(calls[0]!.headers.get('Accept')).toBe('application/json')
  })

  it('devuelve undefined en 204', async () => {
    mockFetch(() => new Response(null, { status: 204 }))
    await expect(apiFetch('/auth/csrf/')).resolves.toBeUndefined()
  })
})

describe('apiFetch: CSRF en métodos mutables', () => {
  it('usa la cookie existente en X-CSRFToken y envía JSON', async () => {
    setCsrfCookie('tok-1')
    const { calls } = mockFetch(() => json(200, { id: 'u1' }))

    await api.post('/auth/login/', { email: 'a@example.com', password: 'x' })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.headers.get('X-CSRFToken')).toBe('tok-1')
    expect(calls[0]!.headers.get('Content-Type')).toBe('application/json')
    expect(calls[0]!.init.body).toBe('{"email":"a@example.com","password":"x"}')
  })

  it('sin cookie pide primero /auth/csrf/ y luego envía el token', async () => {
    const { calls } = mockFetch((call) => {
      if (call.url === '/api/v1/auth/csrf/') {
        setCsrfCookie('fresh')
        return new Response(null, { status: 204 })
      }
      return json(201, { id: 'u1' })
    })

    await api.post('/auth/register/', { email: 'a@example.com' })

    expect(calls.map((c) => c.url)).toEqual(['/api/v1/auth/csrf/', '/api/v1/auth/register/'])
    expect(calls[1]!.headers.get('X-CSRFToken')).toBe('fresh')
  })

  it('peticiones mutables simultáneas comparten una sola llamada a /auth/csrf/', async () => {
    const { calls } = mockFetch((call) => {
      if (call.url.endsWith('/auth/csrf/')) {
        setCsrfCookie('shared')
        return new Response(null, { status: 204 })
      }
      return json(200, {})
    })

    await Promise.all([api.post('/a/'), api.patch('/b/'), api.delete('/c/')])

    expect(calls.filter((c) => c.url.endsWith('/auth/csrf/'))).toHaveLength(1)
  })

  it('ante CSRF_FAILED renueva el token y reintenta UNA vez con la misma Idempotency-Key', async () => {
    setCsrfCookie('viejo')
    const key = newIdempotencyKey()
    const { calls } = mockFetch((call, n) => {
      if (call.url.endsWith('/auth/csrf/')) {
        setCsrfCookie('nuevo')
        return new Response(null, { status: 204 })
      }
      return n === 1 ? json(403, errorBody('CSRF_FAILED')) : json(201, { bid: { seq: 1 } })
    })

    const res = await api.post('/auctions/1/bids/', { amount: '10.00' }, { idempotencyKey: key })

    expect(res).toEqual({ bid: { seq: 1 } })
    expect(calls.map((c) => c.url)).toEqual([
      '/api/v1/auctions/1/bids/',
      '/api/v1/auth/csrf/',
      '/api/v1/auctions/1/bids/',
    ])
    expect(calls[0]!.headers.get('X-CSRFToken')).toBe('viejo')
    expect(calls[2]!.headers.get('X-CSRFToken')).toBe('nuevo')
    expect(calls[0]!.headers.get('Idempotency-Key')).toBe(key)
    expect(calls[2]!.headers.get('Idempotency-Key')).toBe(key)
  })

  it('no entra en bucle si el reintento vuelve a fallar por CSRF', async () => {
    setCsrfCookie('x')
    const { calls } = mockFetch((call) =>
      call.url.endsWith('/auth/csrf/')
        ? new Response(null, { status: 204 })
        : json(403, errorBody('CSRF_FAILED')),
    )

    await expect(api.post('/a/')).rejects.toMatchObject({ status: 403, code: 'CSRF_FAILED' })
    expect(calls.filter((c) => c.url === '/api/v1/a/')).toHaveLength(2)
  })

  it('un 403 FORBIDDEN no dispara reintento', async () => {
    setCsrfCookie('x')
    const { calls } = mockFetch(() => json(403, errorBody('FORBIDDEN')))
    await expect(api.post('/a/')).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(calls).toHaveLength(1)
  })
})

describe('apiFetch: errores tipados', () => {
  it('convierte el cuerpo del contrato en ApiError con code, details y request_id', async () => {
    setCsrfCookie('x')
    mockFetch(() =>
      json(
        409,
        errorBody('BID_BELOW_MINIMUM', 'La oferta no alcanza el mínimo permitido.', {
          minimum_allowed: '130.00',
        }),
      ),
    )

    const err = await api.post('/auctions/1/bids/', { amount: '1.00' }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    const apiErr = err as ApiError
    expect(apiErr.status).toBe(409)
    expect(apiErr.code).toBe('BID_BELOW_MINIMUM')
    expect(apiErr.is('BID_BELOW_MINIMUM')).toBe(true)
    expect(apiErr.message).toBe('La oferta no alcanza el mínimo permitido.')
    expect(apiErr.details).toEqual({ minimum_allowed: '130.00' })
    expect(apiErr.requestId).toBe('req-123')
  })

  it('expone details.fields de VALIDATION_ERROR', async () => {
    mockFetch(() =>
      json(400, errorBody('VALIDATION_ERROR', 'x', { fields: { email: ['Obligatorio.'] } })),
    )
    const err = (await api.get('/x/').catch((e: unknown) => e)) as ApiError
    expect(err.fieldErrors).toEqual({ email: ['Obligatorio.'] })
  })

  it('un code desconocido se conserva en rawCode y code cae a uno conocido por estado', async () => {
    mockFetch(() => json(409, errorBody('ALGO_NUEVO')))
    const err = (await api.get('/x/').catch((e: unknown) => e)) as ApiError
    expect(err.rawCode).toBe('ALGO_NUEVO')
    expect(err.code).toBe('INVALID_RESPONSE')
  })

  it('500 sin JSON (p. ej. página HTML del proxy) → INTERNAL_ERROR con X-Request-ID', async () => {
    mockFetch(
      () =>
        new Response('<html>Bad gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html', 'X-Request-ID': 'hdr-9' },
        }),
    )
    await expect(api.get('/x/')).rejects.toMatchObject({
      status: 502,
      code: 'INTERNAL_ERROR',
      requestId: 'hdr-9',
    })
  })

  it('429 conserva retry_after_s', async () => {
    mockFetch(() => json(429, errorBody('RATE_LIMITED', 'x', { retry_after_s: 60 })))
    await expect(api.get('/x/')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      details: { retry_after_s: 60 },
    })
  })

  it('fallo de red → NETWORK_ERROR (status 0)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(api.get('/x/')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
  })

  it('una cancelación (AbortError) se propaga tal cual para TanStack Query', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')))
    await expect(api.get('/x/')).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('respuesta 200 con JSON inválido → INVALID_RESPONSE', async () => {
    mockFetch(() => new Response('{no json', { status: 200 }))
    await expect(api.get('/x/')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})

describe('Idempotency-Key', () => {
  it('newIdempotencyKey genera UUID v4 distintos', () => {
    const a = newIdempotencyKey()
    const b = newIdempotencyKey()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })

  it('solo se envía si quien llama la indica', async () => {
    setCsrfCookie('x')
    const { calls } = mockFetch(() => json(200, {}))
    await api.post('/a/')
    expect(calls[0]!.headers.get('Idempotency-Key')).toBeNull()
  })
})

describe('apiFetchConditional (polling de live/)', () => {
  it('primera lectura: datos y ETag', async () => {
    mockFetch(() => json(200, { version: 42 }, { ETag: '"v42"' }))
    const res = await apiFetchConditional<{ version: number }>('/auctions/1/live/')
    expect(res).toEqual({ notModified: false, data: { version: 42 }, etag: '"v42"' })
  })

  it('envía If-None-Match y entiende 304 sin cuerpo', async () => {
    const { calls } = mockFetch(
      () => new Response(null, { status: 304, headers: { ETag: '"v42"' } }),
    )
    const res = await apiFetchConditional('/auctions/1/live/', { ifNoneMatch: '"v42"' })
    expect(calls[0]!.headers.get('If-None-Match')).toBe('"v42"')
    expect(res).toEqual({ notModified: true, etag: '"v42"' })
  })

  it('errores siguen siendo ApiError', async () => {
    mockFetch(() => json(404, errorBody('NOT_FOUND')))
    await expect(apiFetchConditional('/auctions/x/live/')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
