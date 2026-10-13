import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { resetServerClock, syncServerTime } from '@/lib/serverClock'
import { apiError, fakeServer, json, makeMe } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

import { Countdown } from './Countdown'
import { formatRemaining } from './formatRemaining'
import type { AuctionDetail, AuctionLive, AuctionSummary } from './types'

const ID = '085df787-cdba-41ae-a639-e3aa53820cbb'
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString()

const SUMMARY: AuctionSummary = {
  id: ID,
  mechanism: 'ascending',
  closing_policy: 'fixed',
  status: 'active',
  result_pending: false,
  title: '[DEMO] Laptop ThinkPad T14',
  category: { id: 2, name: 'Tecnología' },
  currency: 'USD',
  current_price: '310.00',
  minimum_next_bid: '320.00',
  maximum_allowed: null,
  bid_count: 2,
  active_offer_count: null,
  starts_at: inMinutes(-60),
  ends_at: inMinutes(60),
}

const DETAIL: AuctionDetail = {
  ...SUMMARY,
  proxy_enabled: false,
  description: '16 GB RAM\n<b>SSD</b> 512 GB',
  item_condition: 'used',
  location_city: 'Loja',
  images: [],
  seller: { id: 'seller-1', display_name: 'Ana Demo', rating_avg: null, rating_count: 0 },
  starting_price: '300.00',
  min_increment: '10.00',
  has_reserve: true,
  reserve_met: true,
  soft_close: null,
  candle: null,
  server_time: new Date().toISOString(),
  version: 3,
}

const liveOf = (d: AuctionDetail, extra: Partial<AuctionLive> = {}): AuctionLive => ({
  version: d.version,
  status: d.status,
  result_pending: d.result_pending,
  current_price: d.current_price,
  minimum_next_bid: d.minimum_next_bid,
  maximum_allowed: d.maximum_allowed,
  bid_count: d.bid_count,
  active_offer_count: d.active_offer_count,
  ends_at: d.ends_at,
  reserve_met: d.reserve_met,
  server_time: new Date().toISOString(),
  viewer_is_leader: false,
  ...extra,
})

const viewer = {
  is_owner: false,
  is_leader: false,
  watching: false,
  my_proxy_max: null,
  my_sealed_offer: null,
}
const emptyBids = () => json(200, { count: 0, next: null, previous: null, results: [] })

function auctionRoutes(detail: AuctionDetail, live: AuctionLive = liveOf(detail)) {
  return {
    [`GET /auctions/${ID}/`]: () => json(200, detail),
    [`GET /auctions/${ID}/live/`]: () =>
      json(200, live, { ETag: `"${live.version}-${live.status}-0"` }),
    [`GET /auctions/${ID}/bids/`]: emptyBids,
  }
}

const anon = { 'GET /auth/me/': () => apiError(401, 'AUTH_REQUIRED') }
const asUser = { 'GET /auth/me/': () => json(200, makeMe('user')) }

afterEach(() => resetServerClock())

describe('cuenta regresiva', () => {
  it('formatea el tiempo restante', () => {
    expect(formatRemaining(65_000)).toBe('1 min 05 s')
    expect(formatRemaining(3_725_000)).toBe('1 h 02 min 05 s')
    expect(formatRemaining(90_000_000)).toBe('1 d 1 h 0 min')
    expect(formatRemaining(-5)).toBe('0 min 00 s')
  })

  it('usa la hora del servidor, no el reloj local', () => {
    // El servidor va 1 hora adelantado respecto a la laptop.
    syncServerTime(new Date(Date.now() + 60 * 60_000).toISOString())
    render(<Countdown target={inMinutes(70)} prefix="Termina en" elapsedLabel="Cerrando…" />)
    expect(screen.getByText(/Termina en (9|10) min/)).toBeInTheDocument()
  })

  it('si el servidor ya pasó la hora de cierre muestra "Cerrando…"', () => {
    syncServerTime(new Date(Date.now() + 10 * 60_000).toISOString())
    render(<Countdown target={inMinutes(5)} prefix="Termina en" elapsedLabel="Cerrando…" />)
    expect(screen.getByText('Cerrando…')).toBeInTheDocument()
  })
})

describe('catálogo (/)', () => {
  it('lista las subastas; en sobre cerrado muestra ofertas, nunca precio', async () => {
    const sealed: AuctionSummary = {
      ...SUMMARY,
      id: 'sealed-1',
      title: 'Cuadro al óleo',
      mechanism: 'sealed',
      current_price: null,
      bid_count: null,
      active_offer_count: 3,
    }
    fakeServer({
      ...anon,
      'GET /auctions/': () =>
        json(200, { count: 2, next: null, previous: null, results: [SUMMARY, sealed] }),
    })
    renderApp('/')

    const laptop = (await screen.findByText('[DEMO] Laptop ThinkPad T14')).closest('a')!
    expect(laptop).toHaveAttribute('href', `/subastas/${ID}`)
    expect(within(laptop).getByText('$310,00', { exact: false })).toBeInTheDocument()
    expect(within(laptop).getByText(/Termina en/)).toBeInTheDocument()

    const card = screen.getByText('Cuadro al óleo').closest('a')!
    expect(within(card).getByText('3 ofertas')).toBeInTheDocument()
    expect(within(card).queryByText(/\$/)).not.toBeInTheDocument()
  })

  it('los filtros viajan en la URL y en la consulta al backend', async () => {
    const { calls } = fakeServer({
      ...anon,
      'GET /categories/': () => json(200, [{ id: 2, name: 'Tecnología', slug: 'tecnologia' }]),
    })
    renderApp('/')
    const user = userEvent.setup()
    await screen.findByRole('option', { name: 'Tecnología' })
    await user.selectOptions(screen.getByLabelText('Categoría'), '2')
    await user.selectOptions(screen.getByLabelText('Estado'), 'active')
    await user.type(screen.getByRole('searchbox'), 'laptop')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    await waitFor(() => {
      const last = calls.filter((c) => c.path === '/auctions/').at(-1)!
      expect(last.query.get('category')).toBe('2')
      expect(last.query.get('status')).toBe('active')
      expect(last.query.get('q')).toBe('laptop')
    })
    expect(screen.getByTestId('location')).toHaveTextContent('category=2')
  })
})

describe('detalle (/subastas/:id)', () => {
  it('visitante: ve precio, reglas y "Ingresa para pujar"; la descripción es texto plano', async () => {
    fakeServer({ ...anon, ...auctionRoutes(DETAIL) })
    renderApp(`/subastas/${ID}`)

    expect(
      await screen.findByRole('heading', { name: '[DEMO] Laptop ThinkPad T14' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Termina en/)).toBeInTheDocument()
    expect(screen.getByText('Precio de reserva alcanzado.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ingresa para pujar' })).toHaveAttribute(
      'href',
      `/ingresar?next=%2Fsubastas%2F${ID}`,
    )
    expect(screen.getByText(/<b>SSD<\/b> 512 GB/)).toBeInTheDocument()
    expect(document.querySelector('article b')).toBeNull()
  })

  it('puja con Idempotency-Key UUID v4, importe como string y muestra el resultado', async () => {
    const { calls } = fakeServer({
      ...asUser,
      ...auctionRoutes({ ...DETAIL, viewer }),
      [`POST /auctions/${ID}/bids/`]: () =>
        json(201, {
          bid: {
            seq: 3,
            amount: '320.00',
            source: 'manual',
            accepted_at: new Date().toISOString(),
          },
          auction: {
            current_price: '320.00',
            viewer_is_leader: true,
            version: 4,
            ends_at: DETAIL.ends_at,
          },
          outbid_by_proxy: false,
        }),
    })
    renderApp(`/subastas/${ID}`)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Pujar' }))

    expect(await screen.findByText(/Puja de \$320,00 aceptada\. Vas ganando\./)).toBeInTheDocument()
    const post = calls.find((c) => c.method === 'POST' && c.path.endsWith('/bids/'))!
    expect(post.body).toEqual({ amount: '320.00' })
    expect(post.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{8}-[0-9a-f-]{4}-4/)
    expect(post.headers.get('X-CSRFToken')).toBe('test-token')
  })

  it('reintento tras fallo de red reutiliza la MISMA Idempotency-Key; un importe nuevo usa otra', async () => {
    let n = 0
    const { calls } = fakeServer({
      ...asUser,
      ...auctionRoutes({ ...DETAIL, viewer }),
      [`POST /auctions/${ID}/bids/`]: () => {
        n += 1
        if (n === 1) throw new TypeError('Failed to fetch')
        return apiError(409, 'ALREADY_LEADING', 'Ya vas ganando esta subasta.')
      },
    })
    renderApp(`/subastas/${ID}`)
    const user = userEvent.setup()
    const input = await screen.findByLabelText('Tu puja (USD)')
    await user.type(input, '330')
    await user.click(screen.getByRole('button', { name: 'Pujar' }))
    expect(await screen.findByText(/No se pudo conectar/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pujar' }))
    expect(await screen.findByText('Ya vas ganando esta subasta.')).toBeInTheDocument()
    await user.clear(input)
    await user.type(input, '340')
    await user.click(screen.getByRole('button', { name: 'Pujar' }))
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(3))

    const keys = calls
      .filter((c) => c.method === 'POST')
      .map((c) => c.headers.get('Idempotency-Key'))
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[1])
  })

  it('BID_BELOW_MINIMUM muestra el nuevo mínimo; valida importe en el cliente', async () => {
    const { calls } = fakeServer({
      ...asUser,
      ...auctionRoutes({ ...DETAIL, viewer }),
      [`POST /auctions/${ID}/bids/`]: () =>
        apiError(409, 'BID_BELOW_MINIMUM', 'La oferta no alcanza el mínimo permitido.', {
          minimum_allowed: '330.00',
        }),
    })
    renderApp(`/subastas/${ID}`)
    const user = userEvent.setup()
    const input = await screen.findByLabelText('Tu puja (USD)')
    await user.type(input, '12.345')
    await user.click(screen.getByRole('button', { name: 'Pujar' }))
    expect(screen.getByText(/hasta 2 decimales/)).toBeInTheDocument()
    await user.clear(input)
    await user.type(input, '100')
    await user.click(screen.getByRole('button', { name: 'Pujar' }))
    expect(screen.getByText(/La puja mínima es \$320,00/)).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)

    await user.clear(input)
    await user.type(input, '320')
    await user.click(screen.getByRole('button', { name: 'Pujar' }))
    expect(await screen.findByText(/Ahora el mínimo es \$330,00/)).toBeInTheDocument()
  })

  it('pide confirmación si la puja supera 3 veces el precio actual', async () => {
    const { calls } = fakeServer({ ...asUser, ...auctionRoutes({ ...DETAIL, viewer }) })
    renderApp(`/subastas/${ID}`)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Tu puja (USD)'), '1000')
    await user.click(screen.getByRole('button', { name: 'Pujar' }))
    expect(screen.getByText(/más de 3 veces el precio actual/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('dueño no ve formulario; moderador (sin bid.place) tampoco', async () => {
    fakeServer({
      ...asUser,
      ...auctionRoutes({ ...DETAIL, viewer: { ...viewer, is_owner: true } }),
    })
    const { unmount } = renderApp(`/subastas/${ID}`)
    expect(await screen.findByText('Es tu subasta: no puedes pujar.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pujar' })).not.toBeInTheDocument()
    unmount()

    fakeServer({
      'GET /auth/me/': () => json(200, makeMe('moderator')),
      ...auctionRoutes({ ...DETAIL, viewer }),
    })
    renderApp(`/subastas/${ID}`)
    expect(
      await screen.findByRole('heading', { name: '[DEMO] Laptop ThinkPad T14' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pujar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ingresa para pujar' })).not.toBeInTheDocument()
  })

  it('sobre cerrado: sin precio ni "Vas ganando" aunque llegue viewer_is_leader', async () => {
    const sealed: AuctionDetail = {
      ...DETAIL,
      mechanism: 'sealed',
      current_price: null,
      bid_count: null,
      active_offer_count: 4,
      reserve_met: null,
      viewer,
    }
    fakeServer({ ...asUser, ...auctionRoutes(sealed, liveOf(sealed, { viewer_is_leader: true })) })
    renderApp(`/subastas/${ID}`)
    expect(await screen.findByText('4 ofertas')).toBeInTheDocument()
    expect(screen.queryByText(/Vas ganando/)).not.toBeInTheDocument()
    expect(await screen.findByText('Las ofertas son secretas hasta el cierre.')).toBeInTheDocument()
  })

  it('si live/ trae una versión nueva se vuelve a pedir el detalle y se usa el precio fresco', async () => {
    const { calls } = fakeServer({
      ...anon,
      ...auctionRoutes(
        DETAIL,
        liveOf(DETAIL, { version: 4, current_price: '350.00', bid_count: 3 }),
      ),
    })
    renderApp(`/subastas/${ID}`)
    await waitFor(() =>
      expect(calls.filter((c) => c.path === `/auctions/${ID}/`).length).toBeGreaterThanOrEqual(2),
    )
    expect(await screen.findByText('$350,00', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('3 pujas')).toBeInTheDocument()
  })

  it('"Te superaron" si ya pujé y no soy líder', async () => {
    fakeServer({
      ...asUser,
      ...auctionRoutes({ ...DETAIL, viewer }),
      [`GET /auctions/${ID}/bids/`]: () =>
        json(200, {
          count: 2,
          next: null,
          previous: null,
          results: [
            {
              seq: 2,
              amount: '310.00',
              source: 'manual',
              accepted_at: DETAIL.server_time,
              bidder: 'Postor 2',
              counted: true,
            },
            {
              seq: 1,
              amount: '300.00',
              source: 'manual',
              accepted_at: DETAIL.server_time,
              bidder: 'Tú',
              counted: true,
            },
          ],
        }),
    })
    renderApp(`/subastas/${ID}`)
    expect(await screen.findByText(/Te superaron/)).toBeInTheDocument()
    expect(screen.queryByText('Vas ganando.')).not.toBeInTheDocument()
  })

  it('subasta inexistente = 404', async () => {
    fakeServer({ ...anon, [`GET /auctions/${ID}/`]: () => apiError(404, 'NOT_FOUND') })
    renderApp(`/subastas/${ID}`)
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })
})
