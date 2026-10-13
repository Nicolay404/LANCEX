import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { Listing } from '@/features/listings/types'
import { fromGuayaquilInput, toGuayaquilInput } from '@/lib/dates'
import { apiError, fakeServer, json, makeMe } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

import type { AuctionDetail } from '../types'
import { buildCreatePayload, wizardSchema, type WizardValues } from './schema'

const LISTING: Listing = {
  id: '11111111-1111-4111-8111-111111111111',
  category: { id: 2, name: 'Tecnología' },
  title: 'Guitarra acústica',
  description: 'Con funda.',
  item_condition: 'used',
  location_city: 'Loja',
  created_at: '2026-10-12T15:00:00Z',
  updated_at: '2026-10-12T15:00:00Z',
  editable: true,
  images: [],
}
const AUCTION_ID = '22222222-2222-4222-8222-222222222222'
const inDays = (d: number) => toGuayaquilInput(Date.now() + d * 86_400_000)

const base: WizardValues = {
  mechanism: 'ascending',
  starting_price: '100',
  min_increment: '5',
  reserve_price: '',
  proxy_enabled: false,
  start_mode: 'scheduled',
  starts_at: '2026-10-20T10:00',
  ends_at: '2026-10-21T10:00',
  closing_policy: 'fixed',
  soft_window_min: '2',
  soft_extension_min: '2',
  soft_max_total_min: '60',
  candle_window_min: '10',
}

describe('fechas en hora de Ecuador', () => {
  it('convierte datetime-local de Guayaquil a ISO con offset -05:00 y de vuelta', () => {
    expect(fromGuayaquilInput('2026-10-20T10:00')).toBe('2026-10-20T10:00:00-05:00')
    expect(fromGuayaquilInput('20/10/2026')).toBeNull()
    expect(toGuayaquilInput(Date.parse('2026-10-20T15:00:00Z'))).toBe('2026-10-20T10:00')
  })
})

describe('payload de creación', () => {
  it('ascendente con cierre fijo: solo los campos del contrato, importes normalizados', () => {
    expect(buildCreatePayload(base, LISTING.id)).toEqual({
      mechanism: 'ascending',
      closing_policy: 'fixed',
      proxy_enabled: false,
      listing_id: LISTING.id,
      starting_price: '100.00',
      min_increment: '5.00',
      reserve_price: null,
      starts_at: '2026-10-20T15:00:00.000Z',
      ends_at: '2026-10-21T10:00:00-05:00',
    })
  })

  it('sobre cerrado: sin incremento, sin proxy y siempre cierre fijo', () => {
    const p = buildCreatePayload(
      {
        ...base,
        mechanism: 'sealed',
        proxy_enabled: true,
        closing_policy: 'candle',
        reserve_price: '150',
      },
      LISTING.id,
    )
    expect(p.min_increment).toBeUndefined()
    expect(p.proxy_enabled).toBe(false)
    expect(p.closing_policy).toBe('fixed')
    expect(p.candle_window_s).toBeUndefined()
    expect(p.reserve_price).toBe('150.00')
  })

  it('soft close y vela se envían en segundos', () => {
    const soft = buildCreatePayload(
      { ...base, closing_policy: 'soft_close', soft_window_min: '1.5' },
      LISTING.id,
    )
    expect(soft).toMatchObject({
      soft_close_window_s: 90,
      soft_close_extension_s: 120,
      soft_close_max_total_s: 3600,
    })
    expect(
      buildCreatePayload({ ...base, closing_policy: 'candle' }, LISTING.id).candle_window_s,
    ).toBe(600)
  })
})

describe('validación del asistente', () => {
  const errorsOf = (v: WizardValues) => {
    const r = wizardSchema.safeParse(v)
    return r.success
      ? {}
      : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]))
  }
  it('reglas de precios', () => {
    expect(errorsOf({ ...base, starting_price: '0.50' })).toHaveProperty('starting_price')
    expect(errorsOf({ ...base, min_increment: '' })).toHaveProperty('min_increment')
    expect(errorsOf({ ...base, reserve_price: '50' }).reserve_price).toMatch(
      /menor que el precio inicial/,
    )
    expect(errorsOf({ ...base, mechanism: 'sealed', min_increment: '' })).toEqual({})
  })
  it('reglas de fechas y cierre', () => {
    expect(errorsOf({ ...base, ends_at: '2026-10-20T10:01' }).ends_at).toMatch(/al menos 2 minutos/)
    expect(errorsOf({ ...base, ends_at: '2026-12-20T10:00' }).ends_at).toMatch(/30 días/)
    expect(
      errorsOf({ ...base, closing_policy: 'candle', ends_at: '2026-10-20T10:05' })
        .candle_window_min,
    ).toMatch(/no puede ser mayor/)
    expect(
      errorsOf({ ...base, closing_policy: 'soft_close', soft_window_min: '20' }),
    ).toHaveProperty('soft_window_min')
    expect(errorsOf({ ...base, mechanism: 'sealed', closing_policy: 'soft_close' })).toHaveProperty(
      'closing_policy',
    )
  })
})

const asUser = { 'GET /auth/me/': () => json(200, makeMe('user')) }
const listingRoute = { [`GET /listings/${LISTING.id}/`]: () => json(200, LISTING) }
const draftDetail = (status: AuctionDetail['status']): AuctionDetail => ({
  id: AUCTION_ID,
  mechanism: 'ascending',
  closing_policy: 'fixed',
  status,
  result_pending: false,
  title: LISTING.title,
  category: LISTING.category,
  currency: 'USD',
  current_price: null,
  minimum_next_bid: '100.00',
  maximum_allowed: null,
  bid_count: 0,
  active_offer_count: null,
  starts_at: new Date().toISOString(),
  ends_at: new Date(Date.now() + 86_400_000).toISOString(),
  proxy_enabled: false,
  description: LISTING.description,
  item_condition: 'used',
  location_city: 'Loja',
  images: [],
  seller: { id: 'u', display_name: 'Ana Demo', rating_avg: null, rating_count: 0 },
  starting_price: '100.00',
  min_increment: '5.00',
  has_reserve: false,
  reserve_met: null,
  soft_close: null,
  candle: null,
  server_time: new Date().toISOString(),
  version: status === 'draft' ? 1 : 2,
  viewer: {
    is_owner: true,
    is_leader: false,
    watching: false,
    my_proxy_max: null,
    my_sealed_offer: null,
  },
})
const detailRoutes = (status: AuctionDetail['status']) => ({
  [`GET /auctions/${AUCTION_ID}/`]: () => json(200, draftDetail(status)),
  [`GET /auctions/${AUCTION_ID}/live/`]: () =>
    json(200, { ...draftDetail(status), viewer_is_leader: false }),
  [`GET /auctions/${AUCTION_ID}/bids/`]: () =>
    json(200, { count: 0, next: null, previous: null, results: [] }),
})

async function walkToReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Continuar' }))
  await user.type(screen.getByLabelText('Precio inicial (USD)'), '100')
  await user.clear(screen.getByLabelText('Incremento mínimo (USD)'))
  await user.type(screen.getByLabelText('Incremento mínimo (USD)'), '5')
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
  const end = screen.getByLabelText('Fecha y hora de cierre')
  await user.clear(end)
  await user.type(end, inDays(2))
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
  await screen.findByText('Al publicar, las reglas quedan congeladas', { exact: false })
}

describe('asistente /mis-subastas/nueva', () => {
  it('sin publicación indica cómo empezar; moderador = 404', async () => {
    fakeServer(asUser)
    const { unmount } = renderApp('/mis-subastas/nueva')
    expect(
      await screen.findByText(/se crea a partir de una de tus publicaciones/),
    ).toBeInTheDocument()
    unmount()
    fakeServer({ 'GET /auth/me/': () => json(200, makeMe('moderator')) })
    renderApp('/mis-subastas/nueva')
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })

  it('no deja avanzar sin precio inicial', async () => {
    fakeServer({ ...asUser, ...listingRoute })
    renderApp(`/mis-subastas/nueva?listing=${LISTING.id}`)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByText(/Precio: importe con hasta 2 decimales/)).toBeInTheDocument()
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('2. Reglas')
  })

  it('crea y publica: POST /auctions/ + /publish/ y abre la subasta publicada', async () => {
    const { calls } = fakeServer({
      ...asUser,
      ...listingRoute,
      ...detailRoutes('scheduled'),
      'POST /auctions/': () => json(201, draftDetail('draft')),
      [`POST /auctions/${AUCTION_ID}/publish/`]: () => json(200, draftDetail('scheduled')),
    })
    renderApp(`/mis-subastas/nueva?listing=${LISTING.id}`)
    const user = userEvent.setup()
    await walkToReview(user)
    expect(screen.getByText('$100,00', { exact: false })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Publicar ahora' }))

    expect(await screen.findByText(/Subasta publicada/)).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`/subastas/${AUCTION_ID}`)
    const post = calls.find((c) => c.method === 'POST' && c.path === '/auctions/')!
    expect(post.body).toMatchObject({
      mechanism: 'ascending',
      closing_policy: 'fixed',
      listing_id: LISTING.id,
      starting_price: '100.00',
      min_increment: '5.00',
      reserve_price: null,
      proxy_enabled: false,
    })
    expect(Object.keys(post.body as object).sort()).toEqual(
      [
        'closing_policy',
        'ends_at',
        'listing_id',
        'mechanism',
        'min_increment',
        'proxy_enabled',
        'reserve_price',
        'starting_price',
        'starts_at',
      ].sort(),
    )
    expect(calls.some((c) => c.path === `/auctions/${AUCTION_ID}/publish/`)).toBe(true)
  })

  it('error por campo del backend vuelve al paso correspondiente', async () => {
    fakeServer({
      ...asUser,
      ...listingRoute,
      'POST /auctions/': () =>
        apiError(400, 'VALIDATION_ERROR', 'La petición no es válida.', {
          fields: { ends_at: ['La subasta no puede durar más de 30 días.'] },
        }),
    })
    renderApp(`/mis-subastas/nueva?listing=${LISTING.id}`)
    const user = userEvent.setup()
    await walkToReview(user)
    await user.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    expect(await screen.findByText('La subasta no puede durar más de 30 días.')).toBeInTheDocument()
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent(
      '3. Fechas y cierre',
    )
  })

  it('si falla la publicación, queda el borrador con el motivo y el botón Publicar', async () => {
    fakeServer({
      ...asUser,
      ...listingRoute,
      ...detailRoutes('draft'),
      'POST /auctions/': () => json(201, draftDetail('draft')),
      [`POST /auctions/${AUCTION_ID}/publish/`]: () =>
        apiError(400, 'VALIDATION_ERROR', 'La subasta debe durar al menos 2 minutos.'),
    })
    renderApp(`/mis-subastas/nueva?listing=${LISTING.id}`)
    const user = userEvent.setup()
    await walkToReview(user)
    await user.click(screen.getByRole('button', { name: 'Publicar ahora' }))
    expect(
      await screen.findByText(/no se pudo publicar: La subasta debe durar al menos 2 minutos/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publicar subasta' })).toBeInTheDocument()
  })

  it('publicar un borrador desde su página pide confirmación', async () => {
    let published = false
    const { calls } = fakeServer({
      ...asUser,
      [`GET /auctions/${AUCTION_ID}/`]: () =>
        json(200, draftDetail(published ? 'scheduled' : 'draft')),
      [`GET /auctions/${AUCTION_ID}/live/`]: () =>
        json(200, { ...draftDetail(published ? 'scheduled' : 'draft'), viewer_is_leader: false }),
      [`GET /auctions/${AUCTION_ID}/bids/`]: () =>
        json(200, { count: 0, next: null, previous: null, results: [] }),
      [`POST /auctions/${AUCTION_ID}/publish/`]: () => {
        published = true
        return json(200, draftDetail('scheduled'))
      },
    })
    renderApp(`/subastas/${AUCTION_ID}`)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Publicar subasta' }))
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Sí, publicar' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Publicar subasta' })).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Programada')).toBeInTheDocument()
  })

  it('una publicación con subasta abierta no permite crear otra', async () => {
    fakeServer({
      ...asUser,
      [`GET /listings/${LISTING.id}/`]: () => json(200, { ...LISTING, editable: false }),
    })
    renderApp(`/mis-subastas/nueva?listing=${LISTING.id}`)
    expect(
      await screen.findByText(/ya tiene una subasta en borrador, programada o activa/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument()
  })
})
