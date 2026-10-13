import { expect, test } from '@playwright/test'

import { apiAs, pageAs, publishAuction, idle, unique, waitClosed } from './support'

test('sobre cerrado: ofertas secretas, reemplazo y ranking al cierre', async ({ browser }) => {
  const beto = await apiAs('beto')
  const title = `E2E sellado ${unique()}`
  const id = await publishAuction(
    beto,
    title,
    { mechanism: 'sealed', closing_policy: 'fixed', starting_price: '80.00' },
    140,
  )

  const carla = await pageAs(browser, 'carla')
  await carla.goto(`/subastas/${id}`)
  await carla.getByLabel('Tu oferta (USD)').fill('95')
  await carla.getByRole('button', { name: 'Ofertar' }).click()
  await expect(carla.getByText('$95,00').first()).toBeVisible()

  const diego = await pageAs(browser, 'diego')
  await diego.goto(`/subastas/${id}`)
  await diego.getByLabel('Tu oferta (USD)').fill('90')
  await diego.getByRole('button', { name: 'Ofertar' }).click()
  await expect(diego.getByText('$90,00').first()).toBeVisible()
  await diego.getByLabel('Reemplazar por (USD)').fill('120')
  await diego.getByRole('button', { name: 'Reemplazar' }).click()
  await diego.getByRole('button', { name: 'Sí, reemplazar' }).click()
  await expect(diego.getByText('$120,00').first()).toBeVisible()

  // Antes del cierre nadie ve importes ajenos ni quién va primero.
  await carla.reload()
  await expect(carla.getByText('$120,00')).toHaveCount(0)
  await expect(carla.getByText('Vas ganando.')).toHaveCount(0)

  await idle(carla, diego)
  await waitClosed(id)

  await diego.goto(`/subastas/${id}/resultado`)
  await expect(diego.getByText('¡Ganaste esta subasta!')).toBeVisible()
  await carla.goto(`/subastas/${id}/resultado`)
  await expect(carla.getByText('Tu oferta quedó en el puesto 2.')).toBeVisible()
  await expect(carla.getByRole('cell', { name: 'Tú' })).toBeVisible()

  await beto.dispose()
})
