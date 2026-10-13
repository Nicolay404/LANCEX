import { vi } from 'vitest'

import type { UserMe } from '@/api/types'

export interface Recorded {
  method: string
  path: string
  query: URLSearchParams
  body: unknown
  headers: Headers
}

type Handler = (req: Recorded) => Response | Promise<Response>

export function json(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export function apiError(status: number, code: string, message = code, details = {}) {
  return json(status, { code, message, details, request_id: 'req-test' })
}

// Respuestas por defecto para pantallas públicas (catálogo en la portada).
const DEFAULT_ROUTES: Record<string, Handler> = {
  'GET /auctions/': () => json(200, { count: 0, next: null, previous: null, results: [] }),
  'GET /categories/': () => json(200, []),
  'GET /notifications/': () => json(200, { count: 0, next: null, previous: null, results: [] }),
}

/**
 * Servidor falso para pruebas de pantallas: rutas `"MÉTODO /ruta/"` (sin /api/v1).
 * `/auth/csrf/` fija la cookie como Django. Registra cada petición.
 */
export function fakeServer(routes: Record<string, Handler>) {
  const calls: Recorded[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost')
    const path = url.pathname.replace(/^\/api\/v1/, '')
    const method = (init.method ?? 'GET').toUpperCase()
    const req: Recorded = {
      method,
      path,
      query: url.searchParams,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: new Headers(init.headers),
    }
    calls.push(req)
    if (method === 'GET' && path === '/auth/csrf/') {
      document.cookie = 'csrftoken=test-token; path=/'
      return new Response(null, { status: 204 })
    }
    const handler = routes[`${method} ${path}`] ?? DEFAULT_ROUTES[`${method} ${path}`]
    if (!handler) return apiError(404, 'NOT_FOUND')
    return handler(req)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

const BASE_USER_CAPS = [
  'account.manage_own',
  'auction.create_personal',
  'auction.manage_own',
  'bid.place',
  'catalog.view',
  'listing.manage_own',
  'notification.read_own',
  'organization.create',
  'proxy.manage_own',
  'rating.submit',
  'report.create',
  'sealed.manage_own',
  'watchlist.manage_own',
]

const MODERATOR_CAPS = [
  'account.manage_own',
  'catalog.view',
  'moderation.cancel_auction',
  'moderation.review_reports',
  'moderation.suspend_user',
  'moderation.verify_organizations',
  'moderation.view_auction_internals',
  'notification.read_own',
]

const ADMIN_CAPS = [
  ...MODERATOR_CAPS,
  'admin.manage_categories',
  'admin.manage_users',
  'admin.view_audit',
  'admin.view_system_health',
]

// Copias de respuestas reales de /auth/me del backend con seed_demo.
export function makeMe(
  kind: 'user' | 'moderator' | 'admin',
  overrides: Partial<UserMe> = {},
): UserMe {
  const caps = kind === 'user' ? BASE_USER_CAPS : kind === 'moderator' ? MODERATOR_CAPS : ADMIN_CAPS
  return {
    id: '3b8db411-3425-42ef-8410-0760208aa2f1',
    email: `${kind}@demo.lancex.test`,
    display_name:
      kind === 'user' ? 'Ana Demo' : kind === 'moderator' ? 'Moderador Demo' : 'Admin Demo',
    platform_role: kind,
    capabilities: caps,
    organizations: [],
    server_time: '2026-10-13T02:06:12.167849Z',
    ...overrides,
  }
}
