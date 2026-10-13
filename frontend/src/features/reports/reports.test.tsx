import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { AuctionDetail } from '@/features/auctions/types'
import { apiError, fakeServer, json, makeMe } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ID = '55555555-5555-4555-8555-555555555555'
const SELLER = '66666666-6666-4666-8666-666666666666'
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
  status: 'active',
  result_pending: false,
  title: 'Cuadro al óleo',
  category: { id: 5, name: 'Arte' },
  currency: 'USD',
  current_price: null,
  minimum_next_bid: '100.00',
  maximum_allowed: null,
  bid_count: 0,
  active_offer_count: null,
  starts_at: iso(-10),
  ends_at: iso(60),
  proxy_enabled: false,
  description: 'Óleo sobre lienzo',
  item_condition: 'used',
  location_city: 'Quito',
  images: [],
  seller: { id: SELLER, display_name: 'Beto Demo', rating_avg: '4.5', rating_count: 2 },
  starting_price: '100.00',
  min_increment: '5.00',
  has_reserve: false,
  reserve_met: null,
  soft_close: null,
  candle: null,
  server_time: new Date().toISOString(),
  version: 1,
  viewer,
  ...over,
})
const routes = (d: AuctionDetail) => ({
  [`GET /auctions/${ID}/`]: () => json(200, d),
  [`GET /auctions/${ID}/live/`]: () => json(200, { ...d, viewer_is_leader: false }),
  [`GET /auctions/${ID}/bids/`]: () =>
    json(200, { count: 0, next: null, previous: null, results: [] }),
})
const asUser = { 'GET /auth/me/': () => json(200, makeMe('user')) }

async function openDialog() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Reportar subasta' }))
  return user
}

describe('Reportar subasta (LX-38)', () => {
  it('envía {target_type, target_id, reason, detail} y agradece', async () => {
    const { calls } = fakeServer({
      ...asUser,
      ...routes(detail()),
      'POST /reports/': () => json(201, { id: 'r1', status: 'open' }),
    })
    renderApp(`/subastas/${ID}`)
    const user = await openDialog()
    const dialog = screen.getByRole('dialog', { name: 'Reportar esta subasta' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    await user.click(screen.getByRole('radio', { name: /Información engañosa/ }))
    await user.type(screen.getByLabelText(/Detalle/), 'Las fotos son de otro cuadro.')
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }))

    expect(await screen.findByText('Reporte enviado. Gracias.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const post = calls.find((c) => c.path === '/reports/')!
    expect(post.body).toEqual({
      target_type: 'auction',
      target_id: ID,
      reason: 'misleading',
      detail: 'Las fotos son de otro cuadro.',
    })
    expect(post.headers.get('X-CSRFToken')).toBe('test-token')
  })

  it('valida motivo y detalle para "Otro motivo" sin llamar al backend', async () => {
    const { calls } = fakeServer({ ...asUser, ...routes(detail()) })
    renderApp(`/subastas/${ID}`)
    const user = await openDialog()
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Elige un motivo.')
    await user.click(screen.getByRole('radio', { name: /Otro motivo/ }))
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/al menos 10 caracteres/)
    expect(calls.some((c) => c.path === '/reports/')).toBe(false)
  })

  it('Escape cierra y devuelve el foco al botón', async () => {
    fakeServer({ ...asUser, ...routes(detail()) })
    renderApp(`/subastas/${ID}`)
    const user = await openDialog()
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reportar subasta' })).toHaveFocus()
  })

  it('ALREADY_REPORTED se explica sin tratarlo como error; LIMIT_REACHED se muestra', async () => {
    fakeServer({
      ...asUser,
      ...routes(detail()),
      'POST /reports/': () => apiError(409, 'ALREADY_REPORTED', 'Ya reportaste este elemento.'),
    })
    const { unmount } = renderApp(`/subastas/${ID}`)
    let user = await openDialog()
    await user.click(screen.getByRole('radio', { name: /Fraude/ }))
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }))
    expect(await screen.findByText(/Ya reportaste esta subasta/)).toBeInTheDocument()
    unmount()

    fakeServer({
      ...asUser,
      ...routes(detail()),
      'POST /reports/': () =>
        apiError(409, 'LIMIT_REACHED', 'Alcanzaste el máximo de reportes por día.', { limit: 10 }),
    })
    renderApp(`/subastas/${ID}`)
    user = await openDialog()
    await user.click(screen.getByRole('radio', { name: /Fraude/ }))
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }))
    expect(await screen.findByText('Alcanzaste el máximo de reportes por día.')).toBeInTheDocument()
  })

  it('no lo ven el dueño, el moderador ni el visitante', async () => {
    fakeServer({ ...asUser, ...routes(detail({ viewer: { ...viewer, is_owner: true } })) })
    let r = renderApp(`/subastas/${ID}`)
    expect(await screen.findByText('Es tu subasta: no puedes pujar.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reportar subasta' })).not.toBeInTheDocument()
    r.unmount()
    fakeServer({ 'GET /auth/me/': () => json(200, makeMe('moderator')), ...routes(detail()) })
    r = renderApp(`/subastas/${ID}`)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cuadro al óleo' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reportar subasta' })).not.toBeInTheDocument()
    r.unmount()
    fakeServer({
      'GET /auth/me/': () => apiError(401, 'AUTH_REQUIRED'),
      ...routes(detail({ viewer: undefined })),
    })
    renderApp(`/subastas/${ID}`)
    expect(await screen.findByRole('link', { name: 'Ingresa para pujar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reportar subasta' })).not.toBeInTheDocument()
  })
})

describe('perfil público (/usuarios/:id)', () => {
  const profile = {
    id: SELLER,
    display_name: 'Beto Demo',
    rating_avg: '4.5',
    rating_count: 2,
    member_since: '2026-10-01T12:00:00Z',
  }

  it('el vendedor del detalle enlaza a su perfil; se ve reputación y se puede reportar al usuario', async () => {
    const { calls } = fakeServer({
      ...asUser,
      ...routes(detail()),
      [`GET /users/${SELLER}/`]: () => json(200, profile),
      'POST /reports/': () => json(201, { id: 'r2', status: 'open' }),
    })
    renderApp(`/subastas/${ID}`)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('link', { name: 'Beto Demo' }))
    expect(await screen.findByRole('heading', { name: 'Beto Demo' })).toBeInTheDocument()
    expect(screen.getByText(/★ 4\.5 \(2 calificaciones\)/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reportar usuario' }))
    await user.click(screen.getByRole('radio', { name: /Fraude/ }))
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }))
    await waitFor(() =>
      expect(calls.find((c) => c.path === '/reports/')?.body).toMatchObject({
        target_type: 'user',
        target_id: SELLER,
      }),
    )
  })

  it('en el propio perfil no aparece "Reportar"; inexistente = 404', async () => {
    fakeServer({
      ...asUser,
      [`GET /users/${SELLER}/`]: () => json(200, { ...profile, id: makeMe('user').id }),
    })
    const { unmount } = renderApp(`/usuarios/${SELLER}`)
    expect(await screen.findByRole('heading', { name: 'Beto Demo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reportar usuario' })).not.toBeInTheDocument()
    unmount()
    fakeServer({ ...asUser, [`GET /users/${SELLER}/`]: () => apiError(404, 'NOT_FOUND') })
    renderApp(`/usuarios/${SELLER}`)
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })
})
