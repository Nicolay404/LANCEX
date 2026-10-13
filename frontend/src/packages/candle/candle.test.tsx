import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { AuctionDetail, CandleInfo } from '@/features/auctions/types'
import { apiError, fakeServer, json, makeMe } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ID = '085df787-cdba-41ae-a639-e3aa53820cbb'
const COMMIT = '4773d12e2371bb935b9a0f5439b4a1c3ad3f2414b86980f8418d1cfabdfadfef'
const PROOF = {
  auction_id: ID,
  commitment: COMMIT,
  seed_hex: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
  window_start: '2026-10-13T03:55:27.616836+00:00',
  window_s: 600,
  close_at: '2026-10-13T04:01:26.742836+00:00',
  algorithm: 'offset_ms = int(HMAC-SHA256(seed, auction_id.bytes)[:8]) % (window_s*1000)',
}
const iso = (m: number) => new Date(Date.now() + m * 60_000).toISOString()
const candle = (over: Partial<CandleInfo> = {}): CandleInfo => ({
  window_start: iso(20),
  window_s: 600,
  commitment: COMMIT,
  in_window: false,
  price_is_provisional: false,
  notice: null,
  close_at: null,
  ...over,
})
const detail = (over: Partial<AuctionDetail> = {}): AuctionDetail => ({
  id: ID,
  mechanism: 'ascending',
  closing_policy: 'candle',
  status: 'active',
  result_pending: false,
  title: 'Juego de comedor',
  category: { id: 3, name: 'Hogar' },
  currency: 'USD',
  current_price: '210.00',
  minimum_next_bid: '220.00',
  maximum_allowed: null,
  bid_count: 2,
  active_offer_count: null,
  starts_at: iso(-30),
  ends_at: iso(30),
  proxy_enabled: false,
  description: 'Mesa y 6 sillas',
  item_condition: 'used',
  location_city: 'Loja',
  images: [],
  seller: { id: 's', display_name: 'Beto Demo', rating_avg: null, rating_count: 0 },
  starting_price: '200.00',
  min_increment: '10.00',
  has_reserve: false,
  reserve_met: null,
  soft_close: null,
  candle: candle(),
  server_time: new Date().toISOString(),
  version: 4,
  ...over,
})
const anon = { 'GET /auth/me/': () => apiError(401, 'AUTH_REQUIRED') }
const routes = (d: AuctionDetail, bids: object[] = []) => ({
  [`GET /auctions/${ID}/`]: () => json(200, d),
  [`GET /auctions/${ID}/live/`]: () => json(200, { ...d, viewer_is_leader: false }),
  [`GET /auctions/${ID}/bids/`]: () =>
    json(200, { count: bids.length, next: null, previous: null, results: bids }),
})

describe('indicador de vela en el detalle (LX-62)', () => {
  it('antes de la ventana: fase normal, "a más tardar" y compromiso visible', async () => {
    fakeServer({ ...anon, ...routes(detail()) })
    renderApp(`/subastas/${ID}`)
    expect(await screen.findByText(/Fase normal/)).toBeInTheDocument()
    expect(screen.getByText(/Termina a más tardar en/)).toBeInTheDocument()
    expect(screen.getByText('Compromiso publicado')).toBeInTheDocument()
    expect(screen.getByText(COMMIT)).toBeInTheDocument()
    expect(screen.queryByText(/Precio provisional/)).not.toBeInTheDocument()
  })

  it('dentro de la ventana: "Fase de vela" y precio provisional (con la hora del servidor)', async () => {
    fakeServer({
      ...anon,
      ...routes(
        detail({
          candle: candle({
            window_start: iso(-2),
            in_window: true,
            notice: 'La subasta pudo haber terminado ya: el instante real se revela al cierre.',
          }),
        }),
      ),
    })
    renderApp(`/subastas/${ID}`)
    expect(await screen.findByText(/Fase de vela/)).toBeInTheDocument()
    expect(screen.getByText('Precio provisional (fase de vela)')).toBeInTheDocument()
    expect(screen.getByText(/Las pujas posteriores a ese instante no contarán/)).toBeInTheDocument()
  })

  it('el líder en la ventana ve que va primero "por ahora", no "Vas ganando"', async () => {
    const d = detail({
      candle: candle({ window_start: iso(-2), in_window: true }),
      viewer: {
        is_owner: false,
        is_leader: true,
        watching: false,
        my_proxy_max: null,
        my_sealed_offer: null,
      },
    })
    fakeServer({
      'GET /auth/me/': () => json(200, makeMe('user')),
      ...routes(d),
      [`GET /auctions/${ID}/live/`]: () => json(200, { ...d, viewer_is_leader: true }),
    })
    renderApp(`/subastas/${ID}`)
    expect(await screen.findByText(/Vas primero por ahora/)).toBeInTheDocument()
    expect(screen.queryByText('Vas ganando.')).not.toBeInTheDocument()
  })

  it('al cerrar: enlace a verificar y pujas fuera de la vela marcadas "No contó"', async () => {
    const bids = [
      {
        seq: 2,
        amount: '220.00',
        source: 'manual',
        accepted_at: iso(-1),
        bidder: 'Postor 2',
        counted: false,
      },
      {
        seq: 1,
        amount: '210.00',
        source: 'manual',
        accepted_at: iso(-20),
        bidder: 'Postor 1',
        counted: true,
      },
    ]
    fakeServer({
      ...anon,
      ...routes(
        detail({
          status: 'closed',
          ends_at: iso(-1),
          candle: candle({ window_start: iso(-11), close_at: PROOF.close_at }),
        }),
        bids,
      ),
    })
    renderApp(`/subastas/${ID}`)
    expect(
      await screen.findByRole('link', { name: 'Verificar el cierre por vela' }),
    ).toHaveAttribute('href', `/subastas/${ID}/verificar-vela`)
    expect(await screen.findByText('No contó')).toBeInTheDocument()
    expect(screen.getAllByText('No contó')).toHaveLength(1)
  })
})

describe('verificación (/subastas/:id/verificar-vela)', () => {
  const closed = detail({
    status: 'closed',
    candle: candle({ window_start: PROOF.window_start, close_at: PROOF.close_at }),
  })

  it('recalcula en el navegador y confirma las tres comprobaciones', async () => {
    fakeServer({
      ...anon,
      ...routes(closed),
      [`GET /auctions/${ID}/candle-proof/`]: () => json(200, PROOF),
    })
    renderApp(`/subastas/${ID}/verificar-vela`)
    expect(
      await screen.findByText('Verificación correcta: el cierre por vela fue honesto.'),
    ).toBeInTheDocument()
    expect(screen.getAllByText(': correcto')).toHaveLength(3)
    expect(screen.getByText(/2026-10-13T04:01:26\.742836Z/)).toBeInTheDocument()
    expect(screen.getByText(/python scripts\/verify_candle\.py/)).toBeInTheDocument()
  })

  it('si el compromiso publicado no coincide con la prueba, falla', async () => {
    fakeServer({
      ...anon,
      ...routes({ ...closed, candle: { ...closed.candle!, commitment: 'ab'.repeat(32) } }),
      [`GET /auctions/${ID}/candle-proof/`]: () => json(200, PROOF),
    })
    renderApp(`/subastas/${ID}/verificar-vela`)
    expect(await screen.findByText(/La verificación falló/)).toBeInTheDocument()
    expect(screen.getByText(': no coincide')).toBeInTheDocument()
  })

  it('antes del cierre (NOT_REVEALED_YET) y en subasta sin vela (MECHANISM_MISMATCH)', async () => {
    fakeServer({
      ...anon,
      ...routes(detail()),
      [`GET /auctions/${ID}/candle-proof/`]: () =>
        apiError(409, 'NOT_REVEALED_YET', 'La semilla se revela al cierre.'),
    })
    const r = renderApp(`/subastas/${ID}/verificar-vela`)
    expect(
      await screen.findByText(/La semilla se revela cuando la subasta cierra/),
    ).toBeInTheDocument()
    r.unmount()
    fakeServer({
      ...anon,
      ...routes(detail({ closing_policy: 'fixed', candle: null })),
      [`GET /auctions/${ID}/candle-proof/`]: () => apiError(409, 'MECHANISM_MISMATCH', 'No'),
    })
    renderApp(`/subastas/${ID}/verificar-vela`)
    expect(await screen.findByText('Esta subasta no cierra por vela.')).toBeInTheDocument()
  })
})
