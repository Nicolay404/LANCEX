import { expect, request, type APIRequestContext, type Page } from '@playwright/test'

export const BASE = 'http://localhost:5173'
export const API = `${BASE}/api/v1`
export const USERS = ['ana', 'beto', 'carla', 'diego'] as const
export type DemoUser = (typeof USERS)[number]

/** Sesión guardada por global-setup (un solo login por usuario: el login tiene límite por IP). */
export const authFile = (user: DemoUser) => `e2e/.auth/${user}.json`

/** Cliente de la API con la sesión del usuario; CSRF y Origin como el navegador. */
export async function apiAs(user: DemoUser): Promise<Api> {
  const ctx = await request.newContext({ baseURL: BASE, storageState: authFile(user) })
  return new Api(ctx)
}

export class Api {
  readonly ctx: APIRequestContext
  constructor(ctx: APIRequestContext) {
    this.ctx = ctx
  }

  private async csrf(): Promise<string> {
    const state = await this.ctx.storageState()
    const cookie = state.cookies.find((c) => c.name === 'csrftoken')
    if (cookie) return cookie.value
    await this.ctx.get(`${API}/auth/csrf/`)
    return (await this.ctx.storageState()).cookies.find((c) => c.name === 'csrftoken')!.value
  }

  async get<T>(path: string): Promise<T> {
    const r = await this.ctx.get(`${API}${path}`)
    expect(r.ok(), `GET ${path} → ${r.status()} ${await r.text()}`).toBeTruthy()
    return (await r.json()) as T
  }

  async post<T>(path: string, data: unknown, headers: Record<string, string> = {}): Promise<T> {
    const r = await this.ctx.post(`${API}${path}`, {
      data,
      headers: { 'X-CSRFToken': await this.csrf(), Origin: BASE, Referer: `${BASE}/`, ...headers },
    })
    expect(r.ok(), `POST ${path} → ${r.status()} ${await r.text()}`).toBeTruthy()
    return (await r.json()) as T
  }

  dispose() {
    return this.ctx.dispose()
  }
}

/** Hora del servidor (nunca la del equipo que corre las pruebas). */
export async function serverNow(api: Api): Promise<Date> {
  const me = await api.get<{ server_time: string }>('/auth/me/')
  return new Date(me.server_time)
}

export const plus = (d: Date, seconds: number) =>
  new Date(d.getTime() + seconds * 1000).toISOString()

/** Publicación + subasta publicada (vía API: el recorrido de creación tiene su propia prueba). */
export async function publishAuction(
  owner: Api,
  title: string,
  rules: Record<string, unknown>,
  durationS: number,
): Promise<string> {
  const categories = await owner.get<{ id: number }[]>('/categories/')
  const listing = await owner.post<{ id: string }>('/listings/', {
    category_id: categories[0]!.id,
    title,
    description: 'Creada por las pruebas E2E (LX-74).',
    item_condition: 'used',
    location_city: 'Loja',
  })
  const now = await serverNow(owner)
  const auction = await owner.post<{ id: string }>('/auctions/', {
    proxy_enabled: false,
    reserve_price: null,
    ...rules,
    listing_id: listing.id,
    starts_at: now.toISOString(),
    ends_at: plus(now, durationS),
  })
  await owner.post(`/auctions/${auction.id}/publish/`, {})
  return auction.id
}

/**
 * Espera el cierre real (job `close_due_auctions`) con un cliente ANÓNIMO aparte: no gasta el
 * límite de peticiones de los usuarios (120/min). Un 429 solo hace esperar al siguiente intento.
 */
export async function waitClosed(auctionId: string, maxS = 480): Promise<void> {
  const anon = await request.newContext({ baseURL: BASE })
  try {
    await expect
      .poll(
        async () => {
          const r = await anon.get(`${API}/auctions/${auctionId}/`)
          return r.ok() ? ((await r.json()) as { status: string }).status : `http ${r.status()}`
        },
        { timeout: maxS * 1000, intervals: [5_000] },
      )
      .toBe('closed')
  } finally {
    await anon.dispose()
  }
}

/**
 * Las páginas de subasta consultan `live/` cada 2 s. Mientras se espera el cierre se dejan en
 * blanco para no agotar el límite por usuario (varias pruebas usan los mismos usuarios en paralelo).
 */
export async function idle(...pages: Page[]): Promise<void> {
  for (const p of pages) await p.goto('about:blank')
}

export async function pageAs(
  browser: import('@playwright/test').Browser,
  user: DemoUser,
): Promise<Page> {
  const ctx = await browser.newContext({ storageState: authFile(user) })
  return ctx.newPage()
}

export const unique = () => Date.now().toString(36).slice(-5)
