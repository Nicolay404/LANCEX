import { describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { api } from '@/api/client'
import { apiError, fakeServer, json, makeMe } from '@/test/fakeServer'

import { ME_QUERY_KEY } from './keys'
import { logout } from './session'

describe('logout', () => {
  it('llama a /auth/logout/ con CSRF, vacía la caché y recarga', async () => {
    const { calls } = fakeServer({
      'POST /auth/logout/': () => new Response(null, { status: 204 }),
    })
    const client = createQueryClient()
    client.setQueryData(ME_QUERY_KEY, makeMe('user'))
    client.setQueryData(['auctions', 'x'], { secret: true })
    const reload = vi.fn()

    await logout(client, reload)

    expect(calls.find((c) => c.path === '/auth/logout/')!.headers.get('X-CSRFToken')).toBe(
      'test-token',
    )
    expect(client.getQueryData(ME_QUERY_KEY)).toBeUndefined()
    expect(client.getQueryData(['auctions', 'x'])).toBeUndefined()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('limpia y recarga aunque la sesión ya hubiera expirado', async () => {
    fakeServer({ 'POST /auth/logout/': () => apiError(401, 'AUTH_REQUIRED') })
    const client = createQueryClient()
    client.setQueryData(ME_QUERY_KEY, makeMe('user'))
    const reload = vi.fn()
    await logout(client, reload)
    expect(client.getQueryData(ME_QUERY_KEY)).toBeUndefined()
    expect(reload).toHaveBeenCalledOnce()
  })
})

describe('reacción global a errores de autorización', () => {
  it('un 401 AUTH_REQUIRED en cualquier consulta convierte la sesión en visitante', async () => {
    fakeServer({ 'GET /notifications/': () => apiError(401, 'AUTH_REQUIRED') })
    const client = createQueryClient()
    client.setQueryData(ME_QUERY_KEY, makeMe('user'))
    await client
      .fetchQuery({ queryKey: ['notifications'], queryFn: () => api.get('/notifications/') })
      .catch(() => undefined)
    expect(client.getQueryData(ME_QUERY_KEY)).toBeNull()
  })

  it('un 403 FORBIDDEN vuelve a pedir /auth/me (capacidades pudieron cambiar)', async () => {
    const { calls } = fakeServer({
      'GET /notifications/': () => apiError(403, 'FORBIDDEN'),
      'GET /auth/me/': () => json(200, makeMe('user', { capabilities: ['account.manage_own'] })),
    })
    const client = createQueryClient()
    client.setQueryData(ME_QUERY_KEY, makeMe('user'))
    // Un observador activo hace que invalidate vuelva a pedir la consulta.
    const unsubscribe = client.getQueryCache().subscribe(() => undefined)
    client
      .getQueryCache()
      .build(client, { queryKey: ME_QUERY_KEY, queryFn: () => api.get('/auth/me/') })
    await client
      .fetchQuery({ queryKey: ['notifications'], queryFn: () => api.get('/notifications/') })
      .catch(() => undefined)
    await vi.waitFor(() => expect(client.getQueryState(ME_QUERY_KEY)?.isInvalidated).toBe(true))
    unsubscribe()
    expect(calls.some((c) => c.path === '/notifications/')).toBe(true)
  })
})
