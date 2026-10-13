import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { apiError, fakeServer, json, makeMe } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

describe('AccountPage (/cuenta)', () => {
  it('cambia el nombre visible (solo display_name) y el menú se actualiza', async () => {
    const { calls } = fakeServer({
      'GET /auth/me/': () => json(200, makeMe('user')),
      'PATCH /auth/me/': () => json(200, makeMe('user', { display_name: 'Ana Pérez' })),
    })
    renderApp('/cuenta')
    const user = userEvent.setup()
    const input = await screen.findByLabelText('Nombre visible')
    await user.clear(input)
    await user.type(input, 'Ana Pérez')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('link', { name: 'Ana Pérez' })).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ display_name: 'Ana Pérez' })
  })

  it('contraseña actual incorrecta (STEP_UP_FAILED) se marca en su campo', async () => {
    fakeServer({
      'GET /auth/me/': () => json(200, makeMe('user')),
      'POST /auth/password/': () =>
        apiError(403, 'STEP_UP_FAILED', 'La contraseña actual no es correcta.'),
    })
    renderApp('/cuenta')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Contraseña actual'), 'mala')
    await user.type(screen.getByLabelText('Nueva contraseña'), 'OtraClave2026!!')
    await user.type(screen.getByLabelText('Repite la nueva contraseña'), 'OtraClave2026!!')
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    expect(await screen.findByText('La contraseña actual no es correcta.')).toBeInTheDocument()
    // STEP_UP_FAILED no es FORBIDDEN: la sesión sigue igual.
    expect(screen.getByRole('heading', { name: 'Mi cuenta' })).toBeInTheDocument()
  })

  it('cambio de contraseña correcto envía solo current/new y confirma', async () => {
    const { calls } = fakeServer({
      'GET /auth/me/': () => json(200, makeMe('user')),
      'POST /auth/password/': () => new Response(null, { status: 204 }),
    })
    renderApp('/cuenta')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Contraseña actual'), 'DemoLancex2026!')
    await user.type(screen.getByLabelText('Nueva contraseña'), 'OtraClave2026!!')
    await user.type(screen.getByLabelText('Repite la nueva contraseña'), 'OtraClave2026!!')
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    expect(await screen.findByText(/Contraseña actualizada/)).toBeInTheDocument()
    expect(calls.find((c) => c.path === '/auth/password/')!.body).toEqual({
      current_password: 'DemoLancex2026!',
      new_password: 'OtraClave2026!!',
    })
  })
})
