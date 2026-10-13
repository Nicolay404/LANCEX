import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { AuctionDetail } from '@/features/auctions/types'
import type { OwnListingRow } from '@/features/listings/types'
import { fakeServer, json, makeMe } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

import type { MySummary, Participation } from './types'

const me = makeMe('user')
const asUser = { 'GET /auth/me/': () => json(200, me) }
const page = <T,>(results: T[], next: string | null = null) =>
  json(200, { count: results.length, next, previous: null, results })
const iso = (m: number) => new Date(Date.now() + m * 60_000).toISOString()

describe('pendientes de ARQ: vistas personales', () => {
  it('/mis-publicaciones lista GET /listings/ con acciones según editable', async () => {
    const rows: OwnListingRow[] = [
      {
        id: 'l-1',
        category: { id: 1, name: 'Hogar' },
        title: 'Lámpara de pie',
        item_condition: 'used',
        location_city: 'Loja',
        created_at: iso(-100),
        updated_at: iso(-50),
        cover_image_url: null,
        editable: true,
        latest_auction: null,
      },
      {
        id: 'l-2',
        category: { id: 2, name: 'Arte' },
        title: 'Cuadro al óleo',
        item_condition: 'new',
        location_city: 'Cuenca',
        created_at: iso(-100),
        updated_at: iso(-10),
        cover_image_url: 'https://example.test/signed.jpg',
        editable: false,
        latest_auction: { id: 'a-9', status: 'active', mechanism: 'sealed' },
      },
    ]
    fakeServer({ ...asUser, 'GET /listings/': () => page(rows) })
    renderApp('/mis-publicaciones')

    const first = (await screen.findByText('Lámpara de pie')).closest('li')!
    expect(within(first).getByRole('link', { name: 'Editar' })).toHaveAttribute(
      'href',
      '/mis-publicaciones/l-1/editar',
    )
    expect(within(first).getByRole('link', { name: 'Crear subasta' })).toHaveAttribute(
      'href',
      '/mis-subastas/nueva?listing=l-1',
    )
    const second = screen.getByText('Cuadro al óleo').closest('li')!
    expect(within(second).queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
    expect(within(second).getByText('En subasta: no editable')).toBeInTheDocument()
    expect(within(second).getByRole('link', { name: 'Ver' })).toHaveAttribute(
      'href',
      '/mis-publicaciones/l-2/editar',
    )
    expect(within(second).getByRole('link', { name: 'Sobre cerrado' })).toHaveAttribute(
      'href',
      '/subastas/a-9',
    )
  })

  it('/panel muestra el resumen y el aviso de que no es un saldo', async () => {
    const summary: MySummary = {
      server_time: iso(0),
      participations: { leading: 2, outbid: 1, sealed_offers: 0, won: 3 },
      my_auctions: { draft: 1, scheduled_or_active: 2, sold: 4, unsold: 0 },
      unread_notifications: 5,
      operations: {
        notice: 'Resumen informativo: LANCEX no procesa pagos ni guarda saldos.',
        bought_total: '350.00',
        sold_total: '1200.50',
        settled_as_buyer: '0.00',
        settled_as_seller: '600.00',
        pending_settlements: 2,
      },
    }
    fakeServer({ ...asUser, 'GET /me/summary/': () => json(200, summary) })
    renderApp('/panel')

    expect(await screen.findByText(/LANCEX no procesa pagos ni guarda saldos/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Vas ganando: 2' })).toHaveAttribute(
      'href',
      '/mis-pujas',
    )
    expect(screen.getByRole('link', { name: 'Ganadas: 3' })).toHaveAttribute(
      'href',
      '/mis-pujas?tab=won',
    )
    expect(screen.getByText('$1.200,50')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '5 notificaciones sin leer' })).toBeInTheDocument()
  })

  it('/mis-pujas: estado propio por subasta, pestañas en la URL y enlace al resultado', async () => {
    const active: Participation = {
      auction_id: 'a-1',
      title: 'Bicicleta',
      mechanism: 'ascending',
      closing_policy: 'fixed',
      status: 'active',
      ends_at: iso(30),
      my_status: 'outbid',
      current_price: '120.00',
      my_last_bid: '110.00',
      my_proxy_max: '115.00',
      my_sealed_offer: null,
    }
    const won: Participation = {
      ...active,
      auction_id: 'a-2',
      title: 'Guitarra',
      status: 'closed',
      my_status: 'won',
      current_price: '90.00',
      my_proxy_max: null,
    }
    const { calls } = fakeServer({
      ...asUser,
      'GET /me/participations/': (req) => page(req.query.get('tab') === 'won' ? [won] : [active]),
    })
    const user = userEvent.setup()
    renderApp('/mis-pujas')

    const row = (await screen.findByRole('link', { name: 'Bicicleta' })).closest('li')!
    expect(within(row).getByText('Te superaron')).toBeInTheDocument()
    expect(within(row).getByText(/Tu última puja \$110,00/)).toBeInTheDocument()
    expect(within(row).getByText(/Tu máximo automático \$115,00/)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Ganadas' }))
    expect(await screen.findByRole('link', { name: 'Guitarra' })).toHaveAttribute(
      'href',
      '/subastas/a-2/resultado',
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/mis-pujas?tab=won')
    expect(
      calls.filter((c) => c.path === '/me/participations/').map((c) => c.query.get('tab')),
    ).toEqual(expect.arrayContaining(['active', 'won']))
  })

  it('/cuenta: PATCH solo de lo cambiado, vacío = null; sesiones y cerrar las demás', async () => {
    let current = { ...me, bio: 'Coleccionista', location_city: 'Loja' }
    let revoked = false
    const { calls } = fakeServer({
      'GET /auth/me/': () => json(200, current),
      'PATCH /auth/me/': (req) => {
        current = { ...current, ...(req.body as object) }
        return json(200, current)
      },
      'GET /auth/sessions/': () =>
        json(200, {
          results: [
            { id: 'h1', is_current: true, expires_at: iso(600) },
            ...(revoked ? [] : [{ id: 'h2', is_current: false, expires_at: iso(300) }]),
          ],
        }),
      'POST /auth/sessions/revoke-others/': () => {
        revoked = true
        return json(200, { revoked: 1 })
      },
      'GET /me/activity/': () =>
        page([
          {
            id: 7,
            occurred_at: iso(-5),
            action: 'bid_accepted',
            entity_type: 'bid',
            auction_id: 'a-1',
            auction_title: 'Bicicleta',
            details: { amount: '110.00', seq: 3 },
          },
        ]),
    })
    const user = userEvent.setup()
    renderApp('/cuenta')

    const city = await screen.findByLabelText('Ciudad')
    await waitFor(() => expect(city).toHaveValue('Loja'))
    await user.clear(screen.getByLabelText('Presentación'))
    await user.clear(city)
    await user.type(city, 'Cuenca')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Perfil actualizado.')).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      bio: null,
      location_city: 'Cuenca',
    })

    expect(screen.getByText('Este dispositivo')).toBeInTheDocument()
    expect(screen.getByText('Otro dispositivo')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Cerrar sesión en los demás dispositivos' }),
    )
    expect(await screen.findByText('Se cerró 1 sesión en otro dispositivo.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Otro dispositivo')).not.toBeInTheDocument())

    expect(screen.getByText(/Pujaste/)).toHaveTextContent('Pujaste por $110,00 en Bicicleta')
  })

  it('perfil público: presentación, ciudad y subastas del vendedor con ?seller=', async () => {
    const { calls } = fakeServer({
      ...asUser,
      'GET /users/u-9/': () =>
        json(200, {
          id: 'u-9',
          display_name: 'Beto Demo',
          rating_avg: '4.5',
          rating_count: 2,
          member_since: iso(-100000),
          bio: 'Vendo muebles restaurados',
          location_city: 'Loja',
        }),
    })
    renderApp('/usuarios/u-9')
    expect(await screen.findByText('Vendo muebles restaurados')).toBeInTheDocument()
    expect(screen.getByText('Loja')).toBeInTheDocument()
    await waitFor(() =>
      expect(calls.some((c) => c.path === '/auctions/' && c.query.get('seller') === 'u-9')).toBe(
        true,
      ),
    )
  })

  it('detalle: "Reportar publicación" con listing_id y seguidores solo para el dueño', async () => {
    const ID = '55555555-5555-4555-8555-555555555555'
    const base = {
      id: ID,
      mechanism: 'ascending',
      closing_policy: 'fixed',
      status: 'active',
      result_pending: false,
      title: 'Bicicleta',
      category: { id: 1, name: 'Vehículos' },
      currency: 'USD',
      current_price: '100.00',
      minimum_next_bid: '105.00',
      maximum_allowed: null,
      bid_count: 1,
      active_offer_count: null,
      starts_at: iso(-10),
      ends_at: iso(60),
      proxy_enabled: false,
      description: 'x',
      item_condition: 'used',
      location_city: 'Loja',
      images: [],
      seller: { id: 's', display_name: 'Beto', rating_avg: null, rating_count: 0 },
      listing_id: 'l-77',
      starting_price: '50.00',
      min_increment: '5.00',
      has_reserve: false,
      reserve_met: null,
      soft_close: null,
      candle: null,
      server_time: iso(0),
      version: 1,
    } satisfies AuctionDetail
    const viewer = {
      is_owner: false,
      is_leader: false,
      watching: false,
      my_proxy_max: null,
      my_sealed_offer: null,
    }
    let owner = false
    const d = () =>
      owner
        ? { ...base, watchers_count: 3, viewer: { ...viewer, is_owner: true } }
        : { ...base, viewer }
    fakeServer({
      ...asUser,
      [`GET /auctions/${ID}/`]: () => json(200, d()),
      [`GET /auctions/${ID}/live/`]: () => json(200, { ...d(), viewer_is_leader: false }),
      [`GET /auctions/${ID}/bids/`]: () => page([]),
    })
    const { unmount } = renderApp(`/subastas/${ID}`)
    expect(await screen.findByRole('button', { name: 'Reportar publicación' })).toBeInTheDocument()
    expect(screen.queryByText(/personas siguen/)).not.toBeInTheDocument()
    unmount()

    owner = true
    renderApp(`/subastas/${ID}`)
    expect(await screen.findByText('3 personas siguen esta subasta.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reportar publicación' })).not.toBeInTheDocument()
  })
})
