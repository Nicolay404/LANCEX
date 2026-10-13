import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { apiError, fakeServer, json, makeMe } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

async function fill(values: { email: string; name: string; pw: string; pw2: string }) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Email'), values.email)
  await user.type(screen.getByLabelText('Nombre visible'), values.name)
  await user.type(screen.getByLabelText('Contraseña'), values.pw)
  await user.type(screen.getByLabelText('Repite la contraseña'), values.pw2)
  await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
}

const anon = { 'GET /auth/me/': () => apiError(401, 'AUTH_REQUIRED') }

describe('RegisterPage', () => {
  it('crea la cuenta, inicia sesión y NO envía password_confirm (entrada estricta)', async () => {
    const { calls } = fakeServer({
      ...anon,
      'POST /auth/register/': () => json(201, makeMe('user', { display_name: 'Nueva' })),
    })
    renderApp('/registro')
    await fill({
      email: 'nueva@example.com',
      name: 'Nueva',
      pw: 'UnaClaveLarga2026',
      pw2: 'UnaClaveLarga2026',
    })

    expect(await screen.findByRole('link', { name: 'Nueva' })).toHaveAttribute('href', '/cuenta')
    expect(calls.find((c) => c.path === '/auth/register/')!.body).toEqual({
      email: 'nueva@example.com',
      display_name: 'Nueva',
      password: 'UnaClaveLarga2026',
    })
  })

  it('valida en el cliente: email, nombre corto, contraseña corta y confirmación', async () => {
    const { calls } = fakeServer(anon)
    renderApp('/registro')
    await fill({ email: 'no', name: 'X', pw: 'corta', pw2: 'otra' })

    expect(await screen.findByText('Ingresa un email válido.')).toBeInTheDocument()
    expect(screen.getByText('Entre 3 y 60 caracteres.')).toBeInTheDocument()
    expect(screen.getByText('Mínimo 10 caracteres.')).toBeInTheDocument()
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument()
    expect(calls.some((c) => c.path === '/auth/register/')).toBe(false)
  })

  it('muestra los errores por campo del backend junto a cada input', async () => {
    fakeServer({
      ...anon,
      'POST /auth/register/': () =>
        apiError(400, 'VALIDATION_ERROR', 'La petición no es válida.', {
          fields: { password: ['Esta contraseña es demasiado común.'] },
        }),
    })
    renderApp('/registro')
    await fill({ email: 'a@example.com', name: 'Ana', pw: 'password123', pw2: 'password123' })
    expect(await screen.findByText('Esta contraseña es demasiado común.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('email ya registrado se marca en el campo email', async () => {
    fakeServer({
      ...anon,
      'POST /auth/register/': () =>
        apiError(409, 'EMAIL_ALREADY_REGISTERED', 'Ese email ya está registrado.'),
    })
    renderApp('/registro')
    await fill({
      email: 'ana@demo.lancex.test',
      name: 'Ana',
      pw: 'UnaClaveLarga2026',
      pw2: 'UnaClaveLarga2026',
    })
    expect(await screen.findByText('Ese email ya está registrado.')).toBeInTheDocument()
  })
})
