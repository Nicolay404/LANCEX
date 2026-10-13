import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { routes } from './routes'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
}

describe('layout base', () => {
  it('muestra cabecera, navegación y la página de inicio', () => {
    renderAt('/')
    expect(screen.getByRole('link', { name: 'LANCEX' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Subastas' })).toBeInTheDocument()
  })

  it('una ruta no registrada muestra 404 (ADR-0006)', () => {
    renderAt('/admin/users')
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })
})
