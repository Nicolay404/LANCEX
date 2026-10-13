import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { AuctionDetail, AuctionResult } from '@/features/auctions/types'
import type { Listing } from '@/features/listings/types'
import { apiError, fakeServer, json, makeMe } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ID = '99999999-9999-4999-8999-999999999999'
const iso = (m: number) => new Date(Date.now() + m * 60_000).toISOString()
const asUser = { 'GET /auth/me/': () => json(200, makeMe('user')) }
const asAdmin = { 'GET /auth/me/': () => json(200, makeMe('admin')) }
const page = <T,>(results: T[]) =>
  json(200, { count: results.length, next: null, previous: null, results })

const detail = {
  id: ID,
  mechanism: 'ascending',
  closing_policy: 'fixed',
  status: 'closed',
  result_pending: false,
  title: 'Bicicleta',
  category: { id: 1, name: 'Vehículos' },
  currency: 'USD',
  current_price: '150.00',
  minimum_next_bid: null,
  maximum_allowed: null,
  bid_count: 3,
  active_offer_count: null,
  starts_at: iso(-120),
  ends_at: iso(-5),
  proxy_enabled: false,
  description: 'x',
  item_condition: 'used',
  location_city: 'Loja',
  images: [],
  seller: { id: 's', display_name: 'Ana', rating_avg: null, rating_count: 0 },
  starting_price: '100.00',
  min_increment: '5.00',
  has_reserve: false,
  reserve_met: null,
  soft_close: null,
  candle: null,
  server_time: iso(0),
  version: 9,
} satisfies AuctionDetail

const result = (over: Partial<AuctionResult> = {}): AuctionResult => ({
  status: 'closed',
  result_pending: false,
  outcome: 'awarded',
  final_price: '150.00',
  bid_count: 3,
  offer_count: null,
  closed_at: iso(-5),
  cancelled_at: null,
  settlement_status: 'pending',
  has_reserve: false,
  reserve_met: null,
  winner_pseudonym: 'Postor 2',
  viewer: { is_owner: true, is_winner: false, can_rate: false, my_rating: null },
  contact: { display_name: 'Carla', email: 'carla@demo.lancex.test' },
  ...over,
})

describe('LX-73: liquidación y calificación', () => {
  it('el dueño registra "no se concretó" con motivo; luego puede calificar', async () => {
    let r = result()
    const { calls } = fakeServer({
      ...asUser,
      [`GET /auctions/${ID}/`]: () => json(200, detail),
      [`GET /auctions/${ID}/result/`]: () => json(200, r),
      [`PATCH /auctions/${ID}/settlement/`]: (req) => {
        const b = req.body as { settlement_status: 'failed'; settlement_note: string }
        r = result({
          settlement_status: b.settlement_status,
          viewer: { is_owner: true, is_winner: false, can_rate: true, my_rating: null },
        })
        return json(200, b)
      },
    })
    const user = userEvent.setup()
    renderApp(`/subastas/${ID}/resultado`)

    expect(await screen.findByText('Ganador: Postor 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'No se concretó' }))
    const confirm = screen.getByRole('button', { name: 'Confirmar' })
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText('¿Qué pasó?'), 'El ganador no respondió')
    await user.click(confirm)

    expect(await screen.findByRole('link', { name: 'Calificar al ganador' })).toHaveAttribute(
      'href',
      `/calificar/${ID}`,
    )
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      settlement_status: 'failed',
      settlement_note: 'El ganador no respondió',
    })
    expect(screen.queryByRole('button', { name: 'No se concretó' })).not.toBeInTheDocument()
  })

  it('/calificar: elige estrellas, envía {score, comment} y vuelve al resultado', async () => {
    let rated = false
    const { calls } = fakeServer({
      ...asUser,
      [`GET /auctions/${ID}/`]: () => json(200, detail),
      [`GET /auctions/${ID}/result/`]: () =>
        json(
          200,
          result({
            settlement_status: 'completed',
            viewer: {
              is_owner: false,
              is_winner: true,
              can_rate: !rated,
              my_rating: rated ? { score: 4, comment: 'Todo bien' } : null,
            },
          }),
        ),
      [`POST /auctions/${ID}/rating/`]: () => {
        rated = true
        return json(201, { id: 'rt', score: 4 })
      },
    })
    const user = userEvent.setup()
    renderApp(`/calificar/${ID}`)

    const submit = await screen.findByRole('button', { name: 'Enviar calificación' })
    expect(submit).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: /^4 de 5/ }))
    await user.type(screen.getByLabelText('Comentario (opcional)'), ' Todo bien ')
    await user.click(submit)

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(`/subastas/${ID}/resultado`),
    )
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ score: 4, comment: 'Todo bien' })
    expect(await screen.findByText(/Tu calificación/)).toBeInTheDocument()
  })
})

describe('LX-73: imágenes de la publicación', () => {
  const listing = (images: Listing['images'] = []): Listing => ({
    id: 'l-1',
    category: { id: 1, name: 'Hogar' },
    title: 'Lámpara',
    description: 'De pie',
    item_condition: 'used',
    location_city: 'Loja',
    created_at: iso(-100),
    updated_at: iso(-10),
    editable: true,
    images,
  })

  it('sube en 3 pasos (URL firmada → PUT a Storage → confirmar en la primera posición libre)', async () => {
    let images: Listing['images'] = [{ id: 'img-0', url: 'https://s.test/0.jpg', position: 0 }]
    const { calls } = fakeServer({
      ...asUser,
      'GET /categories/': () => json(200, [{ id: 1, name: 'Hogar', slug: 'hogar' }]),
      'GET /listings/l-1/': () => json(200, listing(images)),
      'POST /listings/l-1/images/upload-url/': () =>
        json(200, {
          upload_url:
            'https://storage.test/storage/v1/object/upload/sign/listing-images/l-1/a.png?token=t',
          storage_path: 'listings/l-1/a.png',
          expires_in: 7200,
        }),
      'PUT /storage/v1/object/upload/sign/listing-images/l-1/a.png': () => json(200, { Key: 'x' }),
      'POST /listings/l-1/images/': () => {
        images = [...images, { id: 'img-1', url: 'https://s.test/1.png', position: 1 }]
        return json(201, { id: 'img-1', position: 1, content_type: 'image/png' })
      },
    })
    renderApp('/mis-publicaciones/l-1/editar')

    const input = await screen.findByLabelText('Agregar imagen')
    const file = new File([new Uint8Array(1024)], 'foto.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))
    const sign = calls.find((c) => c.path.endsWith('/upload-url/'))!
    expect(sign.body).toEqual({ content_type: 'image/png', size_bytes: 1024 })
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.headers.get('X-CSRFToken')).toBeNull() // a Storage no van cookies ni CSRF
    expect(calls.find((c) => c.path === '/listings/l-1/images/')?.body).toEqual({
      storage_path: 'listings/l-1/a.png',
      position: 1,
    })
    expect(screen.getByText(/2\/6/)).toBeInTheDocument()
  })

  it('valida tipo antes de pedir nada y explica STORAGE_UNAVAILABLE', async () => {
    const { calls } = fakeServer({
      ...asUser,
      'GET /categories/': () => json(200, [{ id: 1, name: 'Hogar', slug: 'hogar' }]),
      'GET /listings/l-1/': () => json(200, listing()),
      'POST /listings/l-1/images/upload-url/': () =>
        apiError(503, 'STORAGE_UNAVAILABLE', 'El almacenamiento de imágenes no está disponible.'),
    })
    renderApp('/mis-publicaciones/l-1/editar')
    const input = await screen.findByLabelText('Agregar imagen')

    fireEvent.change(input, {
      target: { files: [new File(['x'], 'doc.gif', { type: 'image/gif' })] },
    })
    expect(screen.getByText('Solo JPEG, PNG o WebP.')).toBeInTheDocument()
    expect(calls.some((c) => c.path.endsWith('/upload-url/'))).toBe(false)

    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
    })
    expect(await screen.findByText(/no está disponible por ahora/)).toBeInTheDocument()
  })
})

describe('LX-73: administración', () => {
  it('usuarios: filtros en la URL y cambio de rol con motivo + contraseña', async () => {
    const row = {
      id: 'u-1',
      email: 'beto@demo.lancex.test',
      display_name: 'Beto Demo',
      platform_role: 'user',
      status: 'suspended',
      status_reason: 'Fraude',
      created_at: iso(-1000),
      last_login: null,
    }
    const { calls } = fakeServer({
      ...asAdmin,
      'GET /admin/users/': () => page([row]),
      'POST /admin/users/u-1/role/': () =>
        apiError(409, 'OPEN_ACTIVITY', 'Cierra sus membresías y operaciones abiertas antes.'),
    })
    const user = userEvent.setup()
    renderApp('/admin')

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/admin/usuarios'))
    await user.selectOptions(await screen.findByLabelText('Estado'), 'suspended')
    await waitFor(() =>
      expect(
        calls
          .filter((c) => c.path === '/admin/users/')
          .at(-1)
          ?.query.get('status'),
      ).toBe('suspended'),
    )
    const card = (await screen.findByText('Beto Demo')).closest('li')!
    expect(within(card).getByText('Motivo de la suspensión: Fraude')).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'Cambiar rol' }))
    await user.selectOptions(within(card).getByLabelText('Nuevo rol'), 'moderator')
    await user.type(within(card).getByLabelText('Motivo'), 'Nuevo moderador')
    await user.type(within(card).getByLabelText('Tu contraseña'), 'secreta')
    await user.click(within(card).getByRole('button', { name: 'Confirmar cambio de rol' }))

    expect(await within(card).findByText(/Cierra sus membresías/)).toBeInTheDocument()
    expect(within(card).getByLabelText('Tu contraseña')).toHaveValue('')
    expect(calls.find((c) => c.path === '/admin/users/u-1/role/')?.body).toEqual({
      platform_role: 'moderator',
      reason: 'Nuevo moderador',
      password: 'secreta',
    })
  })

  it('categorías: slug sugerido sin tildes y desactivar', async () => {
    const { calls } = fakeServer({
      ...asAdmin,
      'GET /admin/categories/': () =>
        json(200, [{ id: 3, name: 'Hogar', slug: 'hogar', is_active: true }]),
      'POST /admin/categories/': (req) =>
        json(201, { id: 9, ...(req.body as object), is_active: true }),
      'PATCH /admin/categories/3/': (req) =>
        json(200, { id: 3, name: 'Hogar', slug: 'hogar', ...(req.body as object) }),
    })
    const user = userEvent.setup()
    renderApp('/admin/categorias')

    await user.type(await screen.findByLabelText('Nombre'), 'Música y Órganos')
    expect(screen.getByLabelText('Slug')).toHaveValue('musica-y-organos')
    await user.click(screen.getByRole('button', { name: 'Crear' }))
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
        name: 'Música y Órganos',
        slug: 'musica-y-organos',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Desactivar' }))
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ is_active: false }),
    )
  })

  it('auditoría: filtros a la API con fechas en ISO; sistema avisa si no hay cierre automático', async () => {
    const { calls } = fakeServer({
      ...asAdmin,
      'GET /admin/audit-events/': () => page([]),
      'GET /admin/system-health/': () =>
        json(200, {
          server_time: iso(0),
          close_jobs: [
            {
              dev: 'maria',
              job: 'close_due_auctions',
              last_run_at: iso(-30),
              last_closed_count: 0,
              stale: true,
            },
          ],
          pending_closes: 2,
          counts: { users: 6, open_auctions: 4, closed_auctions: 1, open_reports: 0 },
        }),
    })
    const user = userEvent.setup()
    const { unmount } = renderApp('/admin/auditoria')
    await user.type(await screen.findByLabelText('Acción (ej. bid_accepted)'), 'bid_accepted')
    fireEvent.change(screen.getByLabelText('Desde (hora de Ecuador)'), {
      target: { value: '2026-10-13T08:00' },
    })
    await user.click(screen.getByRole('button', { name: 'Filtrar' }))
    await waitFor(() => {
      const last = calls.filter((c) => c.path === '/admin/audit-events/').at(-1)!
      expect(last.query.get('action')).toBe('bid_accepted')
      expect(last.query.get('from')).toBe('2026-10-13T08:00:00-05:00')
    })
    unmount()

    renderApp('/admin/sistema')
    expect(await screen.findByText(/Ningún backend está ejecutando el cierre/)).toBeInTheDocument()
    expect(screen.getByText(/Sin latido/)).toBeInTheDocument()
  })
})
