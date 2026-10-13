import { expect, test } from '@playwright/test'

import { apiAs, pageAs, publishAuction, idle, unique, waitClosed } from './support'

test('ascendente con puja automática: pujas, cierre, resultado, liquidación y calificaciones', async ({
  browser,
}) => {
  const beto = await apiAs('beto')
  const title = `E2E ascendente ${unique()}`
  const id = await publishAuction(
    beto,
    title,
    {
      mechanism: 'ascending',
      closing_policy: 'fixed',
      proxy_enabled: true,
      starting_price: '100.00',
      min_increment: '5.00',
    },
    150,
  )

  const carla = await pageAs(browser, 'carla')
  await carla.goto(`/subastas/${id}`)
  await expect(carla.getByRole('heading', { name: title })).toBeVisible()
  await carla.getByRole('button', { name: 'Pujar' }).click()
  await expect(carla.getByText(/Puja de \$100,00 aceptada/)).toBeVisible()

  // Diego fija su máximo: el sistema puja por él lo justo para ir primero.
  const diego = await pageAs(browser, 'diego')
  await diego.goto(`/subastas/${id}`)
  await diego.getByLabel('Mi máximo (USD)').fill('150')
  await diego.getByRole('button', { name: 'Fijar' }).click()
  await expect(diego.getByText('Vas ganando.')).toBeVisible()
  // Nunca se muestra el máximo ajeno.
  await expect(carla.getByText('$150,00')).toHaveCount(0)

  await expect(carla.getByText(/Te superaron/)).toBeVisible()
  await carla.getByLabel('Tu puja (USD)').fill('120')
  await carla.getByRole('button', { name: 'Pujar' }).click()
  await expect(carla.getByText(/una puja automática de otro postor la superó/)).toBeVisible()

  await idle(carla, diego)
  await waitClosed(id)

  await diego.goto(`/subastas/${id}/resultado`)
  await expect(diego.getByText('¡Ganaste esta subasta!')).toBeVisible()
  await expect(diego.getByText('$125,00')).toBeVisible()

  const owner = await pageAs(browser, 'beto')
  await owner.goto(`/subastas/${id}/resultado`)
  await expect(owner.getByText(/^Ganador: Postor \d/)).toBeVisible()
  await expect(owner.getByText('diego@demo.lancex.test')).toBeVisible()
  await owner.getByRole('button', { name: 'Sí, se concretó' }).click()
  await owner.getByRole('button', { name: 'Confirmar' }).click()
  await expect(owner.getByText(/Entrega y pago: Concretada/)).toBeVisible()
  await owner.getByRole('link', { name: 'Calificar al ganador' }).click()
  await owner.getByRole('radio', { name: /^5 de 5/ }).click()
  await owner.getByRole('button', { name: 'Enviar calificación' }).click()
  await expect(owner.getByText(/Tu calificación/)).toBeVisible()

  await diego.reload()
  await diego.getByRole('link', { name: 'Calificar al vendedor' }).click()
  await diego.getByRole('radio', { name: /^4 de 5/ }).click()
  await diego.getByRole('button', { name: 'Enviar calificación' }).click()
  await expect(diego.getByText(/Tu calificación/)).toBeVisible()

  await beto.dispose()
})
