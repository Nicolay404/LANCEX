import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { Listing } from '@/features/listings/types'
import { apiError, fakeServer, json, makeMe } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const CATEGORIES = [
  { id: 2, name: 'Tecnología', slug: 'tecnologia' },
  { id: 3, name: 'Hogar y muebles', slug: 'hogar-y-muebles' },
]

const LISTING: Listing = {
  id: '11111111-1111-4111-8111-111111111111',
  category: { id: 2, name: 'Tecnología' },
  title: 'Laptop ThinkPad T14',
  description: 'Buen estado, 16 GB RAM.',
  item_condition: 'used',
  location_city: 'Loja',
  created_at: '2026-10-12T15:00:00Z',
  updated_at: '2026-10-12T15:00:00Z',
  editable: true,
  images: [],
}

const asUser = { 'GET /auth/me/': () => json(200, makeMe('user')) }
const withCategories = { 'GET /categories/': () => json(200, CATEGORIES) }
const listingPath = `/mis-publicaciones/${LISTING.id}/editar`
const listingApi = `/listings/${LISTING.id}/`

async function fillNewListing() {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Título'), 'Bicicleta de montaña')
  await screen.findByRole('option', { name: 'Tecnología' })
  await user.selectOptions(screen.getByLabelText('Categoría'), '3')
  await user.selectOptions(screen.getByLabelText('Estado del artículo'), 'used')
  await user.type(screen.getByLabelText('Descripción'), 'Rodado 29, poco uso.')
  await user.type(screen.getByLabelText('Ciudad'), 'Cuenca')
  return user
}

describe('Mis publicaciones (LX-15)', () => {
  it('el menú muestra "Mis publicaciones" al usuario y no al moderador (ruta = 404)', async () => {
    fakeServer(asUser)
    const { unmount } = renderApp('/mis-publicaciones')
    expect(await screen.findByRole('heading', { name: 'Mis publicaciones' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Principal' })
    expect(within(nav).getByText('Mis publicaciones')).toBeInTheDocument()
    unmount()

    fakeServer({ 'GET /auth/me/': () => json(200, makeMe('moderator')) })
    renderApp('/mis-publicaciones/nueva')
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })

  it('crea la publicación enviando solo los 5 campos del contrato y abre su edición', async () => {
    const created = {
      ...LISTING,
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Bicicleta de montaña',
    }
    const { calls } = fakeServer({
      ...asUser,
      ...withCategories,
      'POST /listings/': () => json(201, created),
    })
    renderApp('/mis-publicaciones/nueva')
    const user = await fillNewListing()
    await user.click(screen.getByRole('button', { name: 'Guardar publicación' }))

    expect(await screen.findByText(/Publicación creada/)).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/mis-publicaciones/${created.id}/editar`,
    )
    const post = calls.find((c) => c.method === 'POST' && c.path === '/listings/')!
    expect(post.headers.get('X-CSRFToken')).toBe('test-token')
    expect(post.body).toEqual({
      category_id: 3,
      title: 'Bicicleta de montaña',
      description: 'Rodado 29, poco uso.',
      item_condition: 'used',
      location_city: 'Cuenca',
    })
  })

  it('valida en el cliente sin llamar al backend', async () => {
    const { calls } = fakeServer({ ...asUser, ...withCategories })
    renderApp('/mis-publicaciones/nueva')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Guardar publicación' }))

    expect(await screen.findByText('Escribe un título.')).toBeInTheDocument()
    expect(screen.getByText('Elige una categoría.')).toBeInTheDocument()
    expect(screen.getByText('Elige el estado del artículo.')).toBeInTheDocument()
    expect(screen.getByText('Describe el artículo.')).toBeInTheDocument()
    expect(screen.getByText('Indica la ciudad.')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('muestra el error por campo del backend (categoría inactiva) junto al select', async () => {
    fakeServer({
      ...asUser,
      ...withCategories,
      'POST /listings/': () =>
        apiError(400, 'VALIDATION_ERROR', 'La petición no es válida.', {
          fields: { category_id: ['La categoría no existe o no está activa.'] },
        }),
    })
    renderApp('/mis-publicaciones/nueva')
    const user = await fillNewListing()
    await user.click(screen.getByRole('button', { name: 'Guardar publicación' }))
    expect(await screen.findByText('La categoría no existe o no está activa.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('LIMIT_REACHED se muestra como aviso', async () => {
    fakeServer({
      ...asUser,
      ...withCategories,
      'POST /listings/': () =>
        apiError(409, 'LIMIT_REACHED', 'Alcanzaste el máximo de publicaciones.', { limit: 50 }),
    })
    renderApp('/mis-publicaciones/nueva')
    const user = await fillNewListing()
    await user.click(screen.getByRole('button', { name: 'Guardar publicación' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Alcanzaste el máximo de publicaciones.',
    )
  })

  it('edita enviando solo el campo modificado (PATCH parcial)', async () => {
    const { calls } = fakeServer({
      ...asUser,
      ...withCategories,
      [`GET ${listingApi}`]: () => json(200, LISTING),
      [`PATCH ${listingApi}`]: () => json(200, { ...LISTING, title: 'Laptop ThinkPad T14 Gen 2' }),
    })
    renderApp(listingPath)
    const user = userEvent.setup()
    const save = await screen.findByRole('button', { name: 'Guardar cambios' })
    expect(save).toBeDisabled()

    const title = screen.getByLabelText('Título')
    await user.type(title, ' Gen 2')
    await user.click(save)

    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Laptop ThinkPad T14 Gen 2' })).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      title: 'Laptop ThinkPad T14 Gen 2',
    })
  })

  it('con subasta abierta (editable=false) el formulario queda bloqueado', async () => {
    fakeServer({
      ...asUser,
      ...withCategories,
      [`GET ${listingApi}`]: () => json(200, { ...LISTING, editable: false }),
    })
    renderApp(listingPath)
    expect(await screen.findByText(/no se puede\s+editar/)).toBeInTheDocument()
    expect(await screen.findByLabelText('Título')).toBeDisabled()
    // La categoría actual se ve seleccionada aunque las categorías lleguen después.
    expect(screen.getByLabelText('Categoría')).toHaveValue('2')
    expect(screen.getByLabelText('Estado del artículo')).toHaveValue('used')
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
  })

  it('LISTING_LOCKED al guardar vuelve a cargar y muestra el bloqueo', async () => {
    let locked = false
    fakeServer({
      ...asUser,
      ...withCategories,
      [`GET ${listingApi}`]: () => json(200, { ...LISTING, editable: !locked }),
      [`PATCH ${listingApi}`]: () => {
        locked = true
        return apiError(409, 'LISTING_LOCKED', 'La publicación tiene una subasta abierta.')
      },
    })
    renderApp(listingPath)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Ciudad'), ' centro')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(/no se puede\s+editar/)).toBeInTheDocument()
    expect(screen.getByLabelText('Ciudad')).toBeDisabled()
  })

  it('una publicación ajena o inexistente es 404', async () => {
    fakeServer({ ...asUser, [`GET ${listingApi}`]: () => apiError(404, 'NOT_FOUND') })
    renderApp(listingPath)
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })
})
