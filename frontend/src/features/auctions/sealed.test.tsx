import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { apiError, fakeServer, json, makeMe } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

import type { AuctionDetail, SealedRankItem } from './types'

const ID = '77777777-7777-4777-8777-777777777777'
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
  mechanism: 'sealed',
  closing_policy: 'fixed',
  status: 'active',
  result_pending: false,
  title: 'Cuadro al óleo',
  category: { id: 5, name: 'Arte' },
  currency: 'USD',
  current_price: null,
  minimum_next_bid: '80.00',
  maximum_allowed: null,
  bid_count: null,
  active_offer_count: 2,
  starts_at: iso(-10),
  ends_at: iso(60),
  proxy_enabled: false,
  description: 'Paisaje',
  item_condition: 'used',
  location_city: 'Loja',
  images: [],
  seller: { id: 's', display_name: 'Beto Demo', rating_avg: null, rating_count: 0 },
  starting_price: '80.00',
  min_increment: null,
  has_reserve: false,
  reserve_met: null,
  soft_close: null,
  candle: null,
  server_time: new Date().toISOString(),
  version: 3,
  viewer,
  ...over,
})
const asUser = { 'GET /auth/me/': () => json(200, makeMe('user')) }
const page = <T,>(results: T[]) =>
  json(200, { count: results.length, next: null, previous: null, results })

function routes(d: () => AuctionDetail, offer: () => object, ranking: SealedRankItem[] = []) {
  return {
    [`GET /auctions/${ID}/`]: () => json(200, d()),
    [`GET /auctions/${ID}/live/`]: () => json(200, { ...d(), viewer_is_leader: true }),
    [`GET /auctions/${ID}/bids/`]: () => page(ranking),
    [`GET /auctions/${ID}/sealed-offer/`]: () => json(200, offer()),
  }
}
const none = () => ({ amount: null, submitted_at: null, active_offer_count: 2 })

describe('oferta sellada (LX-42)', () => {
  it('ofertar: explicación, PUT con Idempotency-Key y sin datos ajenos ni "Vas ganando"', async () => {
    let saved: string | null = null
    const { calls } = fakeServer({
      ...asUser,
      ...routes(detail, () =>
        saved
          ? { amount: saved, submitted_at: new Date().toISOString(), active_offer_count: 3 }
          : none(),
      ),
      [`PUT /auctions/${ID}/sealed-offer/`]: (req) => {
        saved = (req.body as { amount: string }).amount
        return json(201, {
          amount: saved,
          submitted_at: new Date().toISOString(),
          active_offer_count: 3,
        })
      },
    })
    renderApp(`/subastas/${ID}`)
    const user = userEvent.setup()
    expect(
      await screen.findByText(/nadie la ve, ni el vendedor, hasta el cierre/),
    ).toBeInTheDocument()
    expect(screen.getByText('2 ofertas')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Tu oferta (USD)'), '95')
    await user.click(screen.getByRole('button', { name: 'Ofertar' }))

    expect(await screen.findByText(/Oferta de \$95,00 registrada/)).toBeInTheDocument()
    expect(await screen.findByText(/Oferta vigente:/)).toHaveTextContent('$95,00')
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.body).toEqual({ amount: '95.00' })
    expect(put.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
    expect(screen.queryByText(/Vas ganando/)).not.toBeInTheDocument()
    expect(screen.getByText('Las ofertas son secretas hasta el cierre.')).toBeInTheDocument()
  })

  it('valida la oferta mínima en el cliente', async () => {
    const { calls } = fakeServer({ ...asUser, ...routes(detail, none) })
    renderApp(`/subastas/${ID}`)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Tu oferta (USD)'), '50')
    await user.click(screen.getByRole('button', { name: 'Ofertar' }))
    expect(screen.getByText('La oferta mínima es $80,00.')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
  })

  it('reemplazar avisa que pierde prioridad y pide confirmación', async () => {
    const { calls } = fakeServer({
      ...asUser,
      ...routes(detail, () => ({ amount: '90.00', submitted_at: iso(-5), active_offer_count: 2 })),
      [`PUT /auctions/${ID}/sealed-offer/`]: () =>
        json(200, { amount: '100.00', submitted_at: iso(0), active_offer_count: 2 }),
    })
    renderApp(`/subastas/${ID}`)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Reemplazar por (USD)'), '100')
    await user.click(screen.getByRole('button', { name: 'Reemplazar' }))
    expect(screen.getByText(/pierdes prioridad si hay empate/)).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Sí, reemplazar' }))
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ amount: '100.00' }),
    )
  })

  it('retirar pide confirmación y hace DELETE', async () => {
    let withdrawn = false
    const { calls } = fakeServer({
      ...asUser,
      ...routes(detail, () =>
        withdrawn ? none() : { amount: '90.00', submitted_at: iso(-5), active_offer_count: 2 },
      ),
      [`DELETE /auctions/${ID}/sealed-offer/`]: () => {
        withdrawn = true
        return new Response(null, { status: 204 })
      },
    })
    renderApp(`/subastas/${ID}`)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Retirar mi oferta' }))
    await user.click(screen.getByRole('button', { name: 'Sí, retirar' }))
    expect(await screen.findByText(/Retiraste tu oferta/)).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true)
    expect(await screen.findByText('Todavía no enviaste una oferta.')).toBeInTheDocument()
  })

  it('reintento tras fallo de red reutiliza la misma Idempotency-Key', async () => {
    let n = 0
    const { calls } = fakeServer({
      ...asUser,
      ...routes(detail, none),
      [`PUT /auctions/${ID}/sealed-offer/`]: () => {
        n += 1
        if (n === 1) throw new TypeError('Failed to fetch')
        return apiError(409, 'AUCTION_NOT_ACTIVE', 'La subasta no está recibiendo pujas.')
      },
    })
    renderApp(`/subastas/${ID}`)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Tu oferta (USD)'), '95')
    await user.click(screen.getByRole('button', { name: 'Ofertar' }))
    expect(await screen.findByText(/No se pudo conectar/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ofertar' }))
    expect(await screen.findByText('La subasta no está recibiendo pujas.')).toBeInTheDocument()
    const keys = calls
      .filter((c) => c.method === 'PUT')
      .map((c) => c.headers.get('Idempotency-Key'))
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('el dueño no oferta; el visitante ve "Ingresa para ofertar"', async () => {
    fakeServer({
      ...asUser,
      ...routes(() => detail({ viewer: { ...viewer, is_owner: true } }), none),
    })
    const r = renderApp(`/subastas/${ID}`)
    expect(await screen.findByText('Es tu subasta: no puedes pujar.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Tu oferta (USD)')).not.toBeInTheDocument()
    r.unmount()
    fakeServer({
      'GET /auth/me/': () => apiError(401, 'AUTH_REQUIRED'),
      ...routes(() => detail({ viewer: undefined }), none),
    })
    renderApp(`/subastas/${ID}`)
    expect(await screen.findByRole('link', { name: 'Ingresa para ofertar' })).toBeInTheDocument()
  })
})

const RANKING: SealedRankItem[] = [
  { rank: 1, amount: '120.00', submitted_at: iso(-30), bidder: 'Postor 2', is_winner: true },
  { rank: 2, amount: '95.00', submitted_at: iso(-40), bidder: 'Tú', is_winner: false },
]
const closed = () =>
  detail({ status: 'closed', current_price: '120.00', active_offer_count: 2, ends_at: iso(-1) })
const result = {
  status: 'closed',
  result_pending: false,
  outcome: 'awarded',
  final_price: '120.00',
  bid_count: null,
  offer_count: 2,
  closed_at: iso(-1),
  cancelled_at: null,
  settlement_status: null,
  has_reserve: false,
  reserve_met: null,
  viewer: { is_owner: false, is_winner: false, rank: 2 },
}

describe('ranking al cierre', () => {
  it('participante: ranking con seudónimos, "Tú" y la ganadora, en detalle y resultado', async () => {
    fakeServer({
      ...asUser,
      ...routes(closed, none, RANKING),
      [`GET /auctions/${ID}/result/`]: () => json(200, result),
    })
    const r = renderApp(`/subastas/${ID}`)
    expect(await screen.findByRole('heading', { name: 'Ranking de ofertas' })).toBeInTheDocument()
    expect(await screen.findByRole('cell', { name: 'Tú' })).toBeInTheDocument()
    expect(screen.getByText('Ganadora')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Tu oferta/)).not.toBeInTheDocument()
    r.unmount()
    renderApp(`/subastas/${ID}/resultado`)
    expect(await screen.findByText('Tu oferta quedó en el puesto 2.')).toBeInTheDocument()
    expect(await screen.findByRole('cell', { name: 'Postor 2' })).toBeInTheDocument()
  })

  it('dueño ve identidades; público solo el aviso', async () => {
    const withIdentity = RANKING.map((x, i) => ({
      ...x,
      bidder: `Postor ${i + 1}`,
      bidder_identity: { id: `u${i}`, display_name: i === 0 ? 'Carla Demo' : 'Diego Demo' },
    }))
    fakeServer({
      ...asUser,
      ...routes(() => ({ ...closed(), viewer: { ...viewer, is_owner: true } }), none, withIdentity),
    })
    const r = renderApp(`/subastas/${ID}`)
    expect(await screen.findByRole('cell', { name: 'Carla Demo (Postor 1)' })).toBeInTheDocument()
    r.unmount()
    fakeServer({
      'GET /auth/me/': () => apiError(401, 'AUTH_REQUIRED'),
      ...routes(closed, none, []),
    })
    renderApp(`/subastas/${ID}`)
    expect(
      await screen.findByText(/El ranking solo lo ven quienes ofertaron y el vendedor/),
    ).toBeInTheDocument()
  })
})
