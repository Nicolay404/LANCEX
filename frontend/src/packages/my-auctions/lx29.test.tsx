import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { AuctionDetail, AuctionResult, AuctionSummary } from '@/features/auctions/types'
import { apiError, fakeServer, json, makeMe } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ID = '33333333-3333-4333-8333-333333333333'
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
  closing_policy: 'fixed',
  status: 'closed',
  result_pending: false,
  title: 'Bicicleta de montaña',
  category: { id: 1, name: 'Vehículos' },
  currency: 'USD',
  current_price: '150.00',
  minimum_next_bid: null,
  maximum_allowed: null,
  bid_count: 4,
  active_offer_count: null,
  starts_at: iso(-120),
  ends_at: iso(-5),
  proxy_enabled: false,
  description: 'Rodado 29',
  item_condition: 'used',
  location_city: 'Cuenca',
  images: [],
  seller: { id: 's', display_name: 'Ana Demo', rating_avg: null, rating_count: 0 },
  starting_price: '100.00',
  min_increment: '10.00',
  has_reserve: false,
  reserve_met: null,
  soft_close: null,
  candle: null,
  server_time: new Date().toISOString(),
  version: 9,
  ...over,
})

const result = (over: Partial<AuctionResult> = {}): AuctionResult => ({
  status: 'closed',
  result_pending: false,
  outcome: 'awarded',
  final_price: '150.00',
  bid_count: 4,
  offer_count: null,
  closed_at: iso(-5),
  cancelled_at: null,
  settlement_status: null,
  has_reserve: false,
  reserve_met: null,
  ...over,
})

const anon = { 'GET /auth/me/': () => apiError(401, 'AUTH_REQUIRED') }
const asUser = { 'GET /auth/me/': () => json(200, makeMe('user')) }
const routes = (d: AuctionDetail, r: AuctionResult | (() => Response)) => ({
  [`GET /auctions/${ID}/`]: () => json(200, d),
  [`GET /auctions/${ID}/result/`]: typeof r === 'function' ? r : () => json(200, r),
  [`GET /auctions/${ID}/live/`]: () => json(200, { ...d, viewer_is_leader: false }),
  [`GET /auctions/${ID}/bids/`]: () =>
    json(200, { count: 0, next: null, previous: null, results: [] }),
})

describe('resultado (/subastas/:id/resultado)', () => {
  it('público: precio final y número de pujas, sin datos de contacto', async () => {
    fakeServer({ ...anon, ...routes(detail(), result()) })
    renderApp(`/subastas/${ID}/resultado`)
    expect(await screen.findByText('$150,00', { exact: false })).toBeInTheDocument()
    expect(screen.getByText(/4 pujas/)).toBeInTheDocument()
    expect(screen.queryByText(/Datos del/)).not.toBeInTheDocument()
  })

  it('ganador: "¡Ganaste!" y contacto del vendedor con estado de la entrega', async () => {
    fakeServer({
      ...asUser,
      ...routes(
        detail({ viewer }),
        result({
          viewer: { is_owner: false, is_winner: true },
          contact: { display_name: 'Ana Demo', email: 'ana@demo.lancex.test' },
          settlement_status: 'pending',
        }),
      ),
    })
    renderApp(`/subastas/${ID}/resultado`)
    expect(await screen.findByText('¡Ganaste esta subasta!')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Datos del vendedor' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ana@demo.lancex.test' })).toHaveAttribute(
      'href',
      'mailto:ana@demo.lancex.test',
    )
    expect(screen.getByText(/Pendiente de concretar/)).toBeInTheDocument()
  })

  it('dueño con reserva no alcanzada: "Sin venta" y sugerencia', async () => {
    fakeServer({
      ...asUser,
      ...routes(
        detail({ viewer: { ...viewer, is_owner: true } }),
        result({
          outcome: 'unsold',
          final_price: null,
          has_reserve: true,
          reserve_met: false,
          viewer: { is_owner: true, is_winner: false },
        }),
      ),
    })
    renderApp(`/subastas/${ID}/resultado`)
    expect(await screen.findByText('Sin venta')).toBeInTheDocument()
    expect(screen.getByText('No se alcanzó el precio de reserva.')).toBeInTheDocument()
    expect(screen.getByText(/Tu artículo no se vendió/)).toBeInTheDocument()
  })

  it('sobre cerrado: muestra el puesto del participante', async () => {
    fakeServer({
      ...asUser,
      ...routes(
        detail({ mechanism: 'sealed', viewer }),
        result({
          offer_count: 5,
          bid_count: null,
          viewer: { is_owner: false, is_winner: false, rank: 3 },
        }),
      ),
    })
    renderApp(`/subastas/${ID}/resultado`)
    expect(await screen.findByText('Tu oferta quedó en el puesto 3.')).toBeInTheDocument()
    expect(screen.getByText(/5 ofertas/)).toBeInTheDocument()
  })

  it('cancelada y todavía activa', async () => {
    fakeServer({
      ...anon,
      ...routes(
        detail({ status: 'cancelled', cancel_reason: 'Artículo vendido fuera' }),
        result({ status: 'cancelled', outcome: null, cancelled_at: iso(-10) }),
      ),
    })
    const { unmount } = renderApp(`/subastas/${ID}/resultado`)
    expect(await screen.findByText(/se canceló/)).toBeInTheDocument()
    unmount()
    fakeServer({
      ...anon,
      ...routes(
        detail({ status: 'active', ends_at: iso(30) }),
        result({ status: 'active', outcome: null }),
      ),
    })
    renderApp(`/subastas/${ID}/resultado`)
    expect(await screen.findByText(/todavía no termina/)).toBeInTheDocument()
  })

  it('si el resultado está pendiente vuelve a pedirlo hasta tenerlo', async () => {
    let n = 0
    fakeServer({
      ...anon,
      ...routes(detail(), () => {
        n += 1
        return json(200, n === 1 ? result({ result_pending: true, outcome: null }) : result())
      }),
    })
    renderApp(`/subastas/${ID}/resultado`)
    expect(await screen.findByText('Calculando el resultado…')).toBeInTheDocument()
    expect(
      await screen.findByText('$150,00', { exact: false }, { timeout: 5000 }),
    ).toBeInTheDocument()
  })

  it('el detalle de una subasta cerrada enlaza al resultado', async () => {
    fakeServer({ ...anon, ...routes(detail(), result()) })
    renderApp(`/subastas/${ID}`)
    expect(await screen.findByRole('link', { name: 'Ver resultado' })).toHaveAttribute(
      'href',
      `/subastas/${ID}/resultado`,
    )
  })
})

const summary = (over: Partial<AuctionSummary>): AuctionSummary => ({ ...detail(), ...over })

describe('Mis subastas y Mis pujas', () => {
  it('Mis subastas pide mine=owner, filtra por pestaña y las cerradas enlazan al resultado', async () => {
    const { calls } = fakeServer({
      ...asUser,
      'GET /auctions/': (req) =>
        json(200, {
          count: 1,
          next: null,
          previous: null,
          results: [summary({ status: req.query.get('status') === 'draft' ? 'draft' : 'closed' })],
        }),
    })
    renderApp('/mis-subastas')
    const card = (await screen.findByText('Bicicleta de montaña')).closest('a')!
    expect(card).toHaveAttribute('href', `/subastas/${ID}/resultado`)
    expect(calls.find((c) => c.path === '/auctions/')!.query.get('mine')).toBe('owner')

    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Borradores' }))
    await waitFor(() =>
      expect(
        calls
          .filter((c) => c.path === '/auctions/')
          .at(-1)!
          .query.get('status'),
      ).toBe('draft'),
    )
    expect(screen.getByTestId('location')).toHaveTextContent('estado=draft')
    expect(within(nav()).getByText('Mis subastas')).toBeInTheDocument()
  })

  it('Mis pujas usa /me/participations/ y empieza en Activas', async () => {
    const { calls } = fakeServer({
      ...asUser,
      'GET /me/participations/': () =>
        json(200, { count: 0, next: null, previous: null, results: [] }),
    })
    renderApp('/mis-pujas')
    expect(await screen.findByText(/No participas en subastas abiertas/)).toBeInTheDocument()
    const req = calls.find((c) => c.path === '/me/participations/')!
    expect(req.query.get('tab')).toBe('active')
    expect(
      calls.some((c) => c.path === '/auctions/' && c.query.get('mine') === 'participating'),
    ).toBe(false)
  })

  it('moderador: /mis-subastas y /mis-pujas = 404', async () => {
    fakeServer({ 'GET /auth/me/': () => json(200, makeMe('moderator')) })
    const { unmount } = renderApp('/mis-subastas')
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
    unmount()
    renderApp('/mis-pujas')
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })
})

const nav = () => screen.getByRole('navigation', { name: 'Principal' })

describe('cancelar subasta propia', () => {
  const owner = { ...viewer, is_owner: true }

  it('programada: pide motivo (≥3) y envía solo {reason}', async () => {
    let cancelled = false
    const current = () =>
      detail(
        cancelled
          ? { status: 'cancelled', version: 10, viewer: owner }
          : {
              status: 'scheduled',
              starts_at: iso(30),
              ends_at: iso(90),
              bid_count: 0,
              viewer: owner,
            },
      )
    const { calls } = fakeServer({
      ...asUser,
      ...routes(current(), result()),
      [`GET /auctions/${ID}/`]: () => json(200, current()),
      [`GET /auctions/${ID}/live/`]: () => json(200, { ...current(), viewer_is_leader: false }),
      [`POST /auctions/${ID}/cancel/`]: () => {
        cancelled = true
        return json(200, current())
      },
    })
    renderApp(`/subastas/${ID}`)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Cancelar subasta' }))
    const confirm = screen.getByRole('button', { name: 'Confirmar cancelación' })
    await user.type(screen.getByLabelText('Motivo de la cancelación'), 'ya')
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText('Motivo de la cancelación'), ' no está disponible')
    await user.click(confirm)
    await waitFor(() => expect(calls.some((c) => c.path === `/auctions/${ID}/cancel/`)).toBe(true))
    expect(calls.find((c) => c.path === `/auctions/${ID}/cancel/`)!.body).toEqual({
      reason: 'ya no está disponible',
    })
    expect(await screen.findByRole('link', { name: 'Ver resultado' })).toBeInTheDocument()
  })

  it('activa con pujas: no se ofrece cancelar', async () => {
    fakeServer({
      ...asUser,
      ...routes(
        detail({ status: 'active', ends_at: iso(30), bid_count: 2, viewer: owner }),
        result(),
      ),
    })
    renderApp(`/subastas/${ID}`)
    expect(await screen.findByText('Es tu subasta: no puedes pujar.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar subasta' })).not.toBeInTheDocument()
  })

  it('si el backend la rechaza (INVALID_STATE_TRANSITION) muestra el motivo', async () => {
    fakeServer({
      ...asUser,
      ...routes(
        detail({ status: 'active', ends_at: iso(30), bid_count: 0, viewer: owner }),
        result(),
      ),
      [`POST /auctions/${ID}/cancel/`]: () =>
        apiError(409, 'INVALID_STATE_TRANSITION', 'No se puede cancelar en el estado actual.'),
    })
    renderApp(`/subastas/${ID}`)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Cancelar subasta' }))
    await user.type(screen.getByLabelText('Motivo de la cancelación'), 'me equivoqué')
    await user.click(screen.getByRole('button', { name: 'Confirmar cancelación' }))
    expect(await screen.findByText('No se puede cancelar en el estado actual.')).toBeInTheDocument()
  })
})
