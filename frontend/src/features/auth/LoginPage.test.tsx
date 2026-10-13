import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { apiError, fakeServer, json, makeMe } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Contraseña'), password)
  await user.click(screen.getByRole('button', { name: 'Ingresar' }))
}

describe('LoginPage', () => {
  it('inicia sesión con CSRF, actualiza el menú y vuelve a ?next', async () => {
    const { calls } = fakeServer({
      'GET /auth/me/': () => apiError(401, 'AUTH_REQUIRED'),
      'POST /auth/login/': () => json(200, makeMe('user')),
    })
    renderApp('/ingresar?next=%2Fcuenta')

    await fillAndSubmit('ana@demo.lancex.test', 'DemoLancex2026!')

    expect(await screen.findByRole('heading', { name: 'Mi cuenta' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/cuenta')
    const loginCall = calls.find((c) => c.path === '/auth/login/')!
    expect(loginCall.headers.get('X-CSRFToken')).toBe('test-token')
    expect(loginCall.body).toEqual({ email: 'ana@demo.lancex.test', password: 'DemoLancex2026!' })
  })

  it('ignora un ?next externo (sin redirección abierta)', async () => {
    fakeServer({
      'GET /auth/me/': () => apiError(401, 'AUTH_REQUIRED'),
      'POST /auth/login/': () => json(200, makeMe('user')),
    })
    renderApp('/ingresar?next=%2F%2Fevil.example%2Fx')
    await fillAndSubmit('ana@demo.lancex.test', 'DemoLancex2026!')
    expect(await screen.findByRole('heading', { name: 'Subastas' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  })

  it('credenciales inválidas: mensaje genérico del backend y se vacía la contraseña', async () => {
    fakeServer({
      'GET /auth/me/': () => apiError(401, 'AUTH_REQUIRED'),
      'POST /auth/login/': () =>
        apiError(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos.'),
    })
    renderApp('/ingresar')
    await fillAndSubmit('ana@demo.lancex.test', 'mala')

    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.')
    expect(screen.getByLabelText('Contraseña')).toHaveValue('')
    // Un 401 del login NO es "sesión expirada": seguimos en /ingresar.
    expect(screen.getByTestId('location')).toHaveTextContent('/ingresar')
  })

  it('bloqueo por intentos (429) muestra los minutos de espera', async () => {
    fakeServer({
      'GET /auth/me/': () => apiError(401, 'AUTH_REQUIRED'),
      'POST /auth/login/': () =>
        apiError(429, 'RATE_LIMITED', 'Demasiadas peticiones.', { retry_after_s: 840 }),
    })
    renderApp('/ingresar')
    await fillAndSubmit('ana@demo.lancex.test', 'x')
    expect(await screen.findByRole('alert')).toHaveTextContent('Vuelve a intentarlo en 14 minutos')
  })

  it('valida campos vacíos sin llamar al backend', async () => {
    const { calls } = fakeServer({ 'GET /auth/me/': () => apiError(401, 'AUTH_REQUIRED') })
    renderApp('/ingresar')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByText('Ingresa tu email.')).toBeInTheDocument()
    expect(screen.getByText('Ingresa tu contraseña.')).toBeInTheDocument()
    expect(calls.some((c) => c.path === '/auth/login/')).toBe(false)
  })
})
