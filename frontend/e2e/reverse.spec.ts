import { expect, test } from '@playwright/test'

import { apiAs, pageAs, plus, serverNow, idle, unique, waitClosed } from './support'

interface Me {
  organizations: { id: string; legal_name: string; is_buyer: boolean; is_supplier: boolean }[]
}

test('inversa B2B: inscripción, calificación, oferta con total oficial y proveedor ganador', async ({
  browser,
}) => {
  const carlaApi = await apiAs('carla')
  const diegoApi = await apiAs('diego')
  const buyer = (await carlaApi.get<Me>('/auth/me/')).organizations.find(
    (o: Me['organizations'][number]) => o.is_buyer,
  )!
  const supplier = (await diegoApi.get<Me>('/auth/me/')).organizations.find(
    (o: Me['organizations'][number]) => o.is_supplier,
  )!
  const title = `E2E inversa ${unique()}`
  const now = await serverNow(carlaApi)
  const deadline = new Date(now.getTime() + 20 * 86_400_000).toISOString().slice(0, 10)
  const need = await carlaApi.post<{ id: string }>('/procurement-requests/', {
    organization_id: buyer.id,
    title,
    specifications: 'Tóner compatible',
    quantity: '40',
    unit: 'unidad',
    mandatory_requirements: [{ code: 'R1', description: 'Garantía de 6 meses' }],
    delivery_deadline: deadline,
    delivery_location: 'Loja',
  })
  // La inscripción y la calificación ocurren antes del inicio (+100 s).
  const auction = await carlaApi.post<{ id: string }>('/auctions/', {
    mechanism: 'reverse',
    closing_policy: 'fixed',
    proxy_enabled: false,
    organization_id: buyer.id,
    procurement_request_id: need.id,
    reference_budget: '1000.00',
    min_decrement: '5.00',
    starts_at: plus(now, 100),
    ends_at: plus(now, 250),
  })
  await carlaApi.post(`/auctions/${auction.id}/publish/`, {})
  const id = auction.id

  const diego = await pageAs(browser, 'diego')
  await diego.goto(`/org/${supplier.id}/oportunidades`)
  await diego.getByRole('link', { name: new RegExp(title) }).click()
  await diego.getByRole('checkbox', { name: 'Cumplimos este requisito' }).check()
  await diego.getByRole('button', { name: 'Inscribirme' }).click()
  await expect(diego.getByText('Pendiente de revisión')).toBeVisible()

  const carla = await pageAs(browser, 'carla')
  await carla.goto(`/org/${buyer.id}/compras/subastas/${id}/calificacion`)
  const card = carla.getByRole('listitem').filter({ hasText: supplier.legal_name })
  await card.getByRole('button', { name: 'Admitir' }).click()
  await expect(card.getByText('Admitida')).toBeVisible()

  await diego.goto(`/subastas/${id}`)
  const unit = diego.getByLabel('Precio unitario')
  await expect(unit).toBeVisible({ timeout: 150_000 }) // aparece al empezar, sin recargar
  await unit.fill('24.5')
  await diego.getByLabel('Envío').fill('15')
  await expect(diego.getByText(/Total: \$995,00/)).toBeVisible()
  await diego.getByRole('button', { name: 'Revisar oferta' }).click()
  await diego.getByRole('button', { name: 'Confirmar oferta de $995,00' }).click()
  await expect(diego.getByText(/Oferta de \$995,00 aceptada/)).toBeVisible()
  await expect(diego.getByText('24.5000 c/u + envío $15,00')).toBeVisible()

  // La compradora ve seudónimos y ningún desglose mientras está activa.
  await carla.goto(`/subastas/${id}`)
  await expect(carla.getByRole('cell', { name: 'Proveedor 1' })).toBeVisible()
  await expect(carla.getByText('24.5000 c/u')).toHaveCount(0)

  await idle(carla, diego)
  await waitClosed(id)
  await carla.goto(`/subastas/${id}/resultado`)
  await expect(carla.getByText(`Proveedor ganador: ${supplier.legal_name}`)).toBeVisible()

  await carlaApi.dispose()
  await diegoApi.dispose()
})
