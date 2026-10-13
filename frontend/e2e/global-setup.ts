import { mkdirSync } from 'node:fs'

import { request } from '@playwright/test'

import { API, authFile, BASE, USERS } from './support'

/**
 * Inicia sesión UNA vez por usuario demo y guarda la cookie de sesión. El backend limita los
 * logins a 5 por minuto por IP: las pruebas reutilizan estas sesiones en vez de volver a entrar.
 */
export default async function globalSetup() {
  const password = process.env.E2E_DEMO_PASSWORD
  if (!password)
    throw new Error('Define E2E_DEMO_PASSWORD (la misma LANCEX_DEMO_PASSWORD del seed).')
  mkdirSync('e2e/.auth', { recursive: true })
  for (const user of USERS) {
    const ctx = await request.newContext({ baseURL: BASE })
    await ctx.get(`${API}/auth/csrf/`)
    const csrf = (await ctx.storageState()).cookies.find((c) => c.name === 'csrftoken')!.value
    const r = await ctx.post(`${API}/auth/login/`, {
      data: { email: `${user}@demo.lancex.test`, password },
      headers: { 'X-CSRFToken': csrf, Origin: BASE, Referer: `${BASE}/` },
    })
    if (!r.ok()) throw new Error(`Login de ${user}: ${r.status()} ${await r.text()}`)
    await ctx.storageState({ path: authFile(user) })
    await ctx.dispose()
  }
}
