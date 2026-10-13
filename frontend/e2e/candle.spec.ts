import { expect, test } from '@playwright/test'

import { apiAs, pageAs, publishAuction, idle, unique, waitClosed } from './support'

test('cierre por vela: fases, puja en la ventana y verificación del instante secreto', async ({
  browser,
}) => {
  const beto = await apiAs('beto')
  const title = `E2E vela ${unique()}`
  // Ventana mínima (300 s) que empieza 30 s después de publicar.
  const id = await publishAuction(
    beto,
    title,
    {
      mechanism: 'ascending',
      closing_policy: 'candle',
      candle_window_s: 300,
      starting_price: '30.00',
      min_increment: '5.00',
    },
    330,
  )

  const carla = await pageAs(browser, 'carla')
  await carla.goto(`/subastas/${id}`)
  await expect(carla.getByText(/Fase normal/)).toBeVisible()
  await expect(carla.getByText(/Termina a más tardar en/)).toBeVisible()
  await carla.getByRole('button', { name: 'Pujar' }).click()
  await expect(carla.getByText(/aceptada/)).toBeVisible()

  // Sin recargar, la página pasa a la fase de vela con precio provisional.
  await expect(carla.getByText(/Fase de vela/)).toBeVisible({ timeout: 60_000 })
  await expect(carla.getByText('Precio provisional (fase de vela)')).toBeVisible()

  const diego = await pageAs(browser, 'diego')
  await diego.goto(`/subastas/${id}`)
  await diego.getByRole('button', { name: 'Pujar' }).click()
  await expect(diego.getByText(/aceptada/)).toBeVisible()

  await idle(carla, diego)
  await waitClosed(id)

  await carla.goto(`/subastas/${id}/resultado`)
  await carla.getByRole('link', { name: 'Verificar el cierre por vela' }).click()
  await expect(
    carla.getByText('Verificación correcta: el cierre por vela fue honesto.'),
  ).toBeVisible()

  await beto.dispose()
})
