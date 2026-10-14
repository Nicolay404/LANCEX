import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { apiError, fakeServer, json, makeMe } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const asGuest = { 'GET /auth/me/': () => apiError(401, 'AUTH_REQUIRED') }

async function passwordStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Email'), 'ana@demo.lancex.test')
  await user.type(screen.getByLabelText('Contraseña'), 'DemoLancex2026!')
  await user.click(screen.getByRole('button', { name: 'Ingresar' }))
}

describe('Login con verificación en dos pasos', () => {
  it('pide el código; uno incorrecto NO se trata como sesión expirada; el correcto inicia sesión', async () => {
    let attempts = 0
    const { calls } = fakeServer({
      ...asGuest,
      'POST /auth/login/': () => json(200, { mfa_required: true }),
      'POST /auth/login/mfa/': () =>
        ++attempts === 1
          ? apiError(401, 'INVALID_MFA_CODE', 'El código no es correcto.')
          : json(200, makeMe('user')),
    })
    const user = userEvent.setup()
    renderApp('/ingresar')
    await passwordStep(user)

    const code = await screen.findByLabelText('Código de verificación')
    await user.type(code, '12a3456')
    expect(code).toHaveValue('123456') // solo dígitos
    await user.click(screen.getByRole('button', { name: 'Verificar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El código no es correcto.')
    expect(screen.getByTestId('location')).toHaveTextContent('/ingresar')

    await user.type(screen.getByLabelText('Código de verificación'), '654321')
    await user.click(screen.getByRole('button', { name: 'Verificar' }))
    expect(await screen.findByRole('heading', { name: 'Subastas' })).toBeInTheDocument()
    expect(calls.filter((c) => c.path === '/auth/login/mfa/').at(-1)!.body).toEqual({
      code: '654321',
    })
    // La contraseña nunca viaja en el segundo paso.
    expect(JSON.stringify(calls.filter((c) => c.path === '/auth/login/mfa/'))).not.toContain(
      'DemoLancex2026!',
    )
  })

  it('con un código de respaldo y, si pasó el tiempo, vuelve al paso de la contraseña', async () => {
    const { calls } = fakeServer({
      ...asGuest,
      'POST /auth/login/': () => json(200, { mfa_required: true }),
      'POST /auth/login/mfa/': () =>
        apiError(401, 'MFA_SESSION_EXPIRED', 'Vuelve a iniciar sesión.'),
    })
    const user = userEvent.setup()
    renderApp('/ingresar')
    await passwordStep(user)

    await user.click(await screen.findByRole('button', { name: /usar un código de respaldo/ }))
    await user.type(screen.getByLabelText('Código de respaldo'), 'abcd-efgh-jkmn-pqrs')
    await user.click(screen.getByRole('button', { name: 'Verificar' }))

    expect(await screen.findByText(/Vuelve a ingresar tu contraseña/)).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toHaveValue('')
    expect(calls.find((c) => c.path === '/auth/login/mfa/')!.body).toEqual({
      code: 'ABCD-EFGH-JKMN-PQRS',
    })
  })
})

describe('Mi cuenta: activar la verificación en dos pasos', () => {
  it('contraseña → QR y clave → código → muestra los códigos de respaldo una vez', async () => {
    let enabled = false
    const { calls } = fakeServer({
      'GET /auth/me/': () => json(200, makeMe('user')),
      'GET /auth/mfa/': () =>
        json(200, {
          enabled,
          enabled_at: enabled ? '2026-10-14T15:00:00Z' : null,
          recovery_codes_remaining: enabled ? 10 : 0,
        }),
      'POST /auth/mfa/setup/': () =>
        json(200, {
          secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
          otpauth_uri:
            'otpauth://totp/LANCEX%3Aana?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=LANCEX',
        }),
      'POST /auth/mfa/enable/': () => {
        enabled = true
        return json(201, { recovery_codes: ['AAAA-BBBB-CCCC-DDDD', 'EEEE-FFFF-GGGG-HHHH'] })
      },
    })
    const user = userEvent.setup()
    renderApp('/cuenta')

    await user.click(
      await screen.findByRole('button', { name: 'Activar verificación en dos pasos' }),
    )
    await user.type(screen.getByLabelText('Confirma tu contraseña'), 'DemoLancex2026!')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(
      await screen.findByRole('img', { name: 'Código QR para tu app de autenticación' }),
    ).toBeInTheDocument()
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Código de la app'), '123456')
    await user.click(screen.getByRole('button', { name: 'Activar' }))

    const list = await screen.findByRole('list', { name: 'Códigos de respaldo' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Ya los guardé' }))
    expect(await screen.findByText(/Te quedan 10 códigos/)).toBeInTheDocument()
    expect(screen.queryByText('AAAA-BBBB-CCCC-DDDD')).not.toBeInTheDocument()

    expect(calls.find((c) => c.path === '/auth/mfa/setup/')!.body).toEqual({
      password: 'DemoLancex2026!',
    })
    expect(calls.find((c) => c.path === '/auth/mfa/enable/')!.body).toEqual({ code: '123456' })
    // Nada de secretos en el almacenamiento del navegador (solo se LEE para comprobarlo).
    // eslint-disable-next-line no-restricted-globals
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('JBSWY3DP')
  })
})

describe('Restablecer contraseña con el enlace del admin', () => {
  it('quita el token de la URL, lo envía y confirma', async () => {
    const { calls } = fakeServer({
      ...asGuest,
      'POST /auth/password-reset/': () => new Response(null, { status: 204 }),
    })
    const user = userEvent.setup()
    renderApp('/restablecer-contrasena?token=tok-123')

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/restablecer-contrasena$/),
    )
    await user.type(screen.getByLabelText('Nueva contraseña'), 'OtraClave2026!!')
    await user.type(screen.getByLabelText('Repite la nueva contraseña'), 'OtraClave2026!!')
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    expect(await screen.findByText(/Ingresa con tu nueva contraseña/)).toBeInTheDocument()
    expect(calls.find((c) => c.path === '/auth/password-reset/')!.body).toEqual({
      token: 'tok-123',
      new_password: 'OtraClave2026!!',
    })
  })

  it('enlace vencido: muestra el motivo del backend', async () => {
    fakeServer({
      ...asGuest,
      'POST /auth/password-reset/': () =>
        apiError(400, 'VALIDATION_ERROR', 'La petición no es válida.', {
          fields: { token: ['El enlace no es válido o ya expiró.'] },
        }),
    })
    const user = userEvent.setup()
    renderApp('/restablecer-contrasena?token=viejo')
    await user.type(await screen.findByLabelText('Nueva contraseña'), 'OtraClave2026!!')
    await user.type(screen.getByLabelText('Repite la nueva contraseña'), 'OtraClave2026!!')
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El enlace no es válido o ya expiró.',
    )
  })

  it('sin token no muestra el formulario', async () => {
    fakeServer(asGuest)
    renderApp('/restablecer-contrasena')
    expect(await screen.findByText(/Este enlace no es válido/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument()
  })
})

describe('Admin: recuperar el acceso de un usuario', () => {
  const row = {
    id: 'u-1',
    email: 'beto@demo.lancex.test',
    display_name: 'Beto Demo',
    platform_role: 'user',
    status: 'active',
    status_reason: null,
    created_at: '2026-10-01T10:00:00Z',
    last_login: null,
  }
  const asAdmin = {
    'GET /auth/me/': () => json(200, makeMe('admin')),
    'GET /admin/users/': () => json(200, { count: 1, next: null, previous: null, results: [row] }),
  }

  it('genera el enlace con motivo + contraseña y lo muestra completo una vez', async () => {
    const { calls } = fakeServer({
      ...asAdmin,
      'POST /admin/users/u-1/password-reset/': () =>
        json(201, {
          token: 'tok-xyz',
          expires_at: '2026-10-14T16:00:00Z',
          reset_path: '/restablecer-contrasena?token=tok-xyz',
        }),
    })
    const user = userEvent.setup()
    renderApp('/admin/usuarios')
    const card = (await screen.findByText('Beto Demo')).closest('li')!

    await user.click(within(card).getByRole('button', { name: 'Restablecer contraseña' }))
    await user.type(within(card).getByLabelText('Motivo'), 'Olvidó su contraseña')
    await user.type(within(card).getByLabelText('Tu contraseña'), 'secreta')
    await user.click(within(card).getByRole('button', { name: 'Generar enlace' }))

    expect(await within(card).findByLabelText('Enlace de restablecimiento')).toHaveValue(
      `${window.location.origin}/restablecer-contrasena?token=tok-xyz`,
    )
    expect(calls.find((c) => c.path === '/admin/users/u-1/password-reset/')!.body).toEqual({
      reason: 'Olvidó su contraseña',
      password: 'secreta',
    })
  })

  it('quitar el 2FA: explica el 409 si el usuario no lo tenía', async () => {
    fakeServer({
      ...asAdmin,
      'POST /admin/users/u-1/mfa-reset/': () =>
        apiError(409, 'MFA_NOT_ENABLED', 'El usuario no tiene doble factor activo.'),
    })
    const user = userEvent.setup()
    renderApp('/admin/usuarios')
    const card = (await screen.findByText('Beto Demo')).closest('li')!

    await user.click(within(card).getByRole('button', { name: 'Quitar verificación en dos pasos' }))
    await user.type(within(card).getByLabelText('Motivo'), 'Perdió el teléfono')
    await user.type(within(card).getByLabelText('Tu contraseña'), 'secreta')
    await user.click(within(card).getByRole('button', { name: 'Quitar verificación' }))

    expect(await within(card).findByText(/no tiene doble factor activo/)).toBeInTheDocument()
    expect(within(card).getByLabelText('Tu contraseña')).toHaveValue('')
  })
})
