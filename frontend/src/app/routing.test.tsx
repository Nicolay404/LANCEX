import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { apiError, fakeServer, json, makeMe } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const nav = () => screen.getByRole('navigation', { name: 'Principal' })

describe('router por capabilities (ADR-0006)', () => {
  it('visitante: menú público, botones de ingreso y rutas privadas = 404 con enlace a login', async () => {
    fakeServer({ 'GET /auth/me/': () => apiError(401, 'AUTH_REQUIRED') })
    renderApp('/cuenta')

    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
    expect(within(nav()).queryByText('Mi actividad')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ingresar' })).toHaveAttribute('href', '/ingresar')
    expect(screen.getByRole('link', { name: '¿Tienes cuenta? Ingresa' })).toHaveAttribute(
      'href',
      '/ingresar?next=%2Fcuenta',
    )
  })

  it('usuario: ve su menú comercial y su cuenta; moderación y admin no existen', async () => {
    fakeServer({ 'GET /auth/me/': () => json(200, makeMe('user')) })
    const { unmount } = renderApp('/cuenta')

    expect(await screen.findByRole('heading', { name: 'Mi cuenta' })).toBeInTheDocument()
    expect(within(nav()).getByText('Mi actividad')).toBeInTheDocument()
    expect(within(nav()).queryByText('Moderación')).not.toBeInTheDocument()
    expect(within(nav()).queryByText('Administración')).not.toBeInTheDocument()
    unmount()

    renderApp('/moderacion')
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })

  it('moderador: sin menú comercial (/panel = 404) y con moderación', async () => {
    fakeServer({ 'GET /auth/me/': () => json(200, makeMe('moderator')) })
    const { unmount } = renderApp('/panel')

    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
    expect(within(nav()).queryByText('Mi actividad')).not.toBeInTheDocument()
    expect(within(nav()).getByText('Moderación')).toBeInTheDocument()
    expect(within(nav()).queryByText('Administración')).not.toBeInTheDocument()
    unmount()

    renderApp('/moderacion')
    expect(
      await screen.findByRole('heading', { name: 'Bandeja de moderación' }),
    ).toBeInTheDocument()
  })

  it('admin: moderación y administración', async () => {
    fakeServer({ 'GET /auth/me/': () => json(200, makeMe('admin')) })
    renderApp('/admin')
    expect(await screen.findByRole('heading', { name: 'Administración' })).toBeInTheDocument()
    expect(within(nav()).getByText('Moderación')).toBeInTheDocument()
  })

  it('con sesión, /ingresar redirige al inicio', async () => {
    fakeServer({ 'GET /auth/me/': () => json(200, makeMe('user')) })
    renderApp('/ingresar')
    expect(await screen.findByRole('heading', { name: 'Subastas' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  })

  it('contexto de organización: selector, paquete según capacidades y org ajena = 404', async () => {
    const me = makeMe('user', {
      organizations: [
        {
          id: 'org-1',
          legal_name: 'Insumos Loja S.A.',
          role: 'owner',
          verification_status: 'verified',
          is_buyer: true,
          is_supplier: false,
          capabilities: ['auction.create_reverse', 'org.view', 'procurement.manage'],
        },
      ],
    })
    fakeServer({ 'GET /auth/me/': () => json(200, me) })
    const { unmount } = renderApp('/org/org-1')

    expect(await screen.findByRole('heading', { name: 'Insumos Loja S.A.' })).toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: 'Secciones de la organización' })
    expect(within(tabs).getByRole('link', { name: 'Compras' })).toHaveAttribute(
      'href',
      '/org/org-1/compras',
    )
    // Sin capacidades de proveedora ni `org.edit_profile`: esas secciones no existen.
    expect(within(tabs).queryByRole('link', { name: 'Oportunidades' })).not.toBeInTheDocument()
    expect(within(tabs).queryByRole('link', { name: 'Perfil' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Contexto activo' })).toHaveValue('org-1')
    unmount()

    renderApp('/org/otra-org')
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })

  it('si /auth/me falla (backend caído) muestra error con código de soporte y reintento', async () => {
    fakeServer({ 'GET /auth/me/': () => apiError(500, 'INTERNAL_ERROR') })
    renderApp('/')
    expect(await screen.findByText('No se pudo cargar tu sesión')).toBeInTheDocument()
    expect(screen.getByText(/Código de soporte: req-test/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})
