import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { AppNotification } from '@/features/notifications/api'
import { notificationLink, notificationText } from '@/features/notifications/messages'
import { apiError, fakeServer, json, makeMe } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

import type { AuctionDetail } from './types'

const ID = '44444444-4444-4444-8444-444444444444'
const iso = (m: number) => new Date(Date.now() + m * 60_000).toISOString()
const viewer = {
  is_owner: false,
  is_leader: false,
  watching: false,
  my_proxy_max: null,
  my_sealed_offer: null,
}

const detail = (over: Partial<AuctionDetail> = {}): AuctionDetail => ({
  id: ID,
  mechanism: 'ascending',
  closing_policy: 'soft_close',
  status: 'active',
  result_pending: false,
  title: 'Bicicleta de montaña',
  category: { id: 1, name: 'Vehículos' },
  currency: 'USD',
  current_price: '120.00',
  minimum_next_bid: '130.00',
  maximum_allowed: null,
  bid_count: 1,
  active_offer_count: null,
  starts_at: iso(-60),
  ends_at: iso(30),
  proxy_enabled: true,
  description: 'Rodado 29',
  item_condition: 'used',
  location_city: 'Cuenca',
  images: [],
  seller: { id: 's', display_name: 'Ana Demo', rating_avg: null, rating_count: 0 },
  starting_price: '120.00',
  min_increment: '10.00',
  has_reserve: false,
  reserve_met: null,
  soft_close: {
    window_s: 120,
    extension_s: 120,
    max_total_s: 3600,
    original_ends_at: null,
    extended: false,
  },
  candle: null,
  server_time: new Date().toISOString(),
  version: 5,
  viewer,
  ...over,
})
const live = (d: AuctionDetail, over: Record<string, unknown> = {}) => ({
  version: d.version,
  status: d.status,
  result_pending: false,
  current_price: d.current_price,
  minimum_next_bid: d.minimum_next_bid,
  maximum_allowed: null,
  bid_count: d.bid_count,
  active_offer_count: null,
  ends_at: d.ends_at,
  reserve_met: null,
  server_time: new Date().toISOString(),
  viewer_is_leader: false,
  ...over,
})
const asUser = { 'GET /auth/me/': () => json(200, makeMe('user')) }
const routes = (d: AuctionDetail, l = live(d)) => ({
  [`GET /auctions/${ID}/`]: () => json(200, d),
  [`GET /auctions/${ID}/live/`]: () => json(200, l),
  [`GET /auctions/${ID}/bids/`]: () =>
    json(200, { count: 0, next: null, previous: null, results: [] }),
  [`GET /auctions/${ID}/proxy-limit/`]: () =>
    json(200, { max_amount: null, status: null, is_leader: false }),
})

describe('puja automática (LX-35)', () => {
  it('se explica y fija el máximo con PUT {max_amount}', async () => {
    let saved: string | null = null
    const { calls } = fakeServer({
      ...asUser,
      ...routes(detail()),
      [`GET /auctions/${ID}/proxy-limit/`]: () =>
        json(200, { max_amount: saved, status: saved ? 'active' : null, is_leader: !!saved }),
      [`PUT /auctions/${ID}/proxy-limit/`]: () => {
        saved = '500.00'
        return json(200, {
          bid: { seq: 2, amount: '130.00', source: 'proxy', accepted_at: new Date().toISOString() },
          auction: {
            current_price: '130.00',
            viewer_is_leader: true,
            version: 6,
            ends_at: iso(30),
          },
          outbid_by_proxy: false,
          max_amount: '500.00',
          status: 'active',
          is_leader: true,
        })
      },
    })
    renderApp(`/subastas/${ID}`)
    const user = userEvent.setup()
    expect(await screen.findByText(/Nadie más lo ve y solo puedes subirlo/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Mi máximo (USD)'), '500')
    await user.click(screen.getByRole('button', { name: 'Fijar' }))

    expect(
      await screen.findByText(/Máximo de \$500,00 activo\. Vas ganando con \$130,00/),
    ).toBeInTheDocument()
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.body).toEqual({ max_amount: '500.00' })
    expect(put.headers.get('X-CSRFToken')).toBe('test-token')
    expect(await screen.findByText(/Tu máximo actual/)).toHaveTextContent('$500,00')
  })

  it('si otro máximo mayor responde al instante lo avisa sin revelar ese máximo', async () => {
    fakeServer({
      ...asUser,
      ...routes(detail()),
      [`PUT /auctions/${ID}/proxy-limit/`]: () =>
        json(200, {
          bid: { seq: 2, amount: '200.00', source: 'proxy', accepted_at: new Date().toISOString() },
          auction: {
            current_price: '210.00',
            viewer_is_leader: false,
            version: 7,
            ends_at: iso(30),
          },
          outbid_by_proxy: true,
          max_amount: '200.00',
          status: 'exhausted',
          is_leader: false,
        }),
    })
    renderApp(`/subastas/${ID}`)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Mi máximo (USD)'), '200')
    await user.click(screen.getByRole('button', { name: 'Fijar' }))
    expect(
      await screen.findByText(
        /Otro postor tenía un máximo mayor y te superó al instante\. Precio actual \$210,00/,
      ),
    ).toBeInTheDocument()
  })

  it('solo se puede subir: valida en el cliente y muestra PROXY_LIMIT_DECREASE_NOT_ALLOWED', async () => {
    const { calls } = fakeServer({
      ...asUser,
      ...routes(detail()),
      [`GET /auctions/${ID}/proxy-limit/`]: () =>
        json(200, { max_amount: '300.00', status: 'active', is_leader: true }),
      [`PUT /auctions/${ID}/proxy-limit/`]: () =>
        apiError(409, 'PROXY_LIMIT_DECREASE_NOT_ALLOWED', 'Solo puedes subir tu máximo.'),
    })
    renderApp(`/subastas/${ID}`)
    const user = userEvent.setup()
    const input = await screen.findByLabelText('Subir mi máximo a (USD)')
    await user.type(input, '250')
    await user.click(screen.getByRole('button', { name: 'Subir' }))
    expect(screen.getByText(/debe ser mayor que \$300,00/)).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
  })

  it('sin proxy habilitado, o para el dueño, no aparece', async () => {
    fakeServer({ ...asUser, ...routes(detail({ proxy_enabled: false })) })
    const { unmount } = renderApp(`/subastas/${ID}`)
    expect(await screen.findByRole('button', { name: 'Pujar' })).toBeInTheDocument()
    expect(screen.queryByText('Puja automática', { selector: 'h2' })).not.toBeInTheDocument()
    unmount()
    fakeServer({ ...asUser, ...routes(detail({ viewer: { ...viewer, is_owner: true } })) })
    renderApp(`/subastas/${ID}`)
    expect(await screen.findByText('Es tu subasta: no puedes pujar.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Mi máximo (USD)')).not.toBeInTheDocument()
  })
})

describe('cierre con extensión (soft close)', () => {
  it('avisa cuando live/ trae un ends_at posterior mientras se mira la subasta', async () => {
    const d = detail()
    const later = new Date(Date.parse(d.ends_at!) + 2 * 60_000).toISOString()
    fakeServer({ ...asUser, ...routes(d, live(d, { version: 6, ends_at: later })) })
    renderApp(`/subastas/${ID}`)
    expect(
      await screen.findByText(/Cierre extendido 2 min por una puja de último momento/),
    ).toBeInTheDocument()
  })
})

describe('seguir subasta', () => {
  it('PUT para seguir y DELETE para dejar de seguir, con estado accesible', async () => {
    const { calls } = fakeServer({
      ...asUser,
      ...routes(detail()),
      [`PUT /auctions/${ID}/watch/`]: () => new Response(null, { status: 204 }),
      [`DELETE /auctions/${ID}/watch/`]: () => new Response(null, { status: 204 }),
    })
    renderApp(`/subastas/${ID}`)
    const user = userEvent.setup()
    const btn = await screen.findByRole('button', { name: '☆ Seguir subasta' })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    await user.click(btn)
    expect(await screen.findByRole('button', { name: '★ Siguiendo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: '★ Siguiendo' }))
    await waitFor(() =>
      expect(calls.map((c) => c.method).filter((m) => m === 'PUT' || m === 'DELETE')).toEqual([
        'PUT',
        'DELETE',
      ]),
    )
  })

  it('/seguimiento pide mine=watching', async () => {
    const { calls } = fakeServer(asUser)
    renderApp('/seguimiento')
    expect(await screen.findByText(/No sigues subastas en este estado/)).toBeInTheDocument()
    expect(calls.find((c) => c.path === '/auctions/')!.query.get('mine')).toBe('watching')
  })
})

const n = (over: Partial<AppNotification>): AppNotification => ({
  id: 1,
  type: 'outbid',
  auction_id: ID,
  data: { title: 'Bicicleta', current_price: '150.00' },
  created_at: new Date().toISOString(),
  read_at: null,
  ...over,
})

describe('notificaciones', () => {
  it('textos por tipo y enlaces (resultado para cierres)', () => {
    expect(notificationText(n({}))).toBe(
      'Te superaron en «Bicicleta». Precio actual: $150,00.'.replace(' ', ' '),
    )
    expect(
      notificationText(n({ type: 'auction_won', data: { title: 'Bici', final_price: '200' } })),
    ).toMatch(/¡Ganaste «Bici»!/)
    expect(notificationText(n({ type: 'tipo_nuevo' }))).toBe('Tienes una novedad en LANCEX.')
    expect(notificationLink(n({}))).toBe(`/subastas/${ID}`)
    expect(notificationLink(n({ type: 'auction_lost' }))).toBe(`/subastas/${ID}/resultado`)
    expect(notificationLink(n({ auction_id: null }))).toBeNull()
  })

  it('la campana muestra no leídas (también al moderador); el visitante no la ve', async () => {
    fakeServer({
      ...asUser,
      'GET /notifications/': (req) =>
        json(200, {
          count: req.query.get('unread') === 'true' ? 3 : 0,
          next: null,
          previous: null,
          results: [],
        }),
    })
    const { unmount } = renderApp('/')
    expect(await screen.findByRole('link', { name: 'Notificaciones: 3 sin leer' })).toHaveAttribute(
      'href',
      '/notificaciones',
    )
    unmount()
    fakeServer({ 'GET /auth/me/': () => json(200, makeMe('moderator')) })
    const r = renderApp('/')
    expect(await screen.findByRole('link', { name: 'Notificaciones' })).toBeInTheDocument()
    r.unmount()
    fakeServer({ 'GET /auth/me/': () => apiError(401, 'AUTH_REQUIRED') })
    renderApp('/')
    expect(await screen.findByRole('link', { name: 'Ingresar' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Notificaciones/ })).not.toBeInTheDocument()
  })

  it('/notificaciones: lista, marca una y todas como leídas', async () => {
    const { calls } = fakeServer({
      ...asUser,
      'GET /notifications/': () =>
        json(200, {
          count: 2,
          next: null,
          previous: null,
          results: [
            n({ id: 7 }),
            n({
              id: 8,
              type: 'auction_won',
              data: { title: 'Mesa', final_price: '40.00' },
              read_at: new Date().toISOString(),
            }),
          ],
        }),
      'POST /notifications/read/': () => json(200, { updated: 1 }),
    })
    renderApp('/notificaciones')
    const user = userEvent.setup()
    expect(
      await screen.findByRole('link', { name: /Te superaron en «Bicicleta»/ }),
    ).toHaveAttribute('href', `/subastas/${ID}`)
    expect(screen.getByRole('link', { name: /¡Ganaste «Mesa»!/ })).toHaveAttribute(
      'href',
      `/subastas/${ID}/resultado`,
    )
    await user.click(screen.getByRole('button', { name: 'Marcar leída' }))
    await user.click(screen.getByRole('button', { name: 'Marcar todas como leídas' }))
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'POST').map((c) => c.body)).toEqual([
        { ids: [7] },
        { all: true },
      ]),
    )
    await user.click(screen.getByRole('tab', { name: 'No leídas' }))
    await waitFor(() =>
      expect(
        calls
          .filter((c) => c.path === '/notifications/')
          .at(-1)!
          .query.get('unread'),
      ).toBe('true'),
    )
  })
})
