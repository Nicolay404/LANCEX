import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { UserOrganization } from '@/api/types'
import type { AuctionDetail } from '@/features/auctions/types'
import type { Organization } from '@/features/organizations/types'
import { reverseTotal } from '@/lib/money'
import { apiError, fakeServer, json, makeMe } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

import type { Participant, ProcurementRequest, ReverseInfo } from './types'

const ME_ID = '3b8db411-3425-42ef-8410-0760208aa2f1'
const BUYER = '11111111-1111-4111-8111-111111111111'
const SUPPLIER = '22222222-2222-4222-8222-222222222222'
const AUCTION = '33333333-3333-4333-8333-333333333333'
const NEED = '44444444-4444-4444-8444-444444444444'
const iso = (m: number) => new Date(Date.now() + m * 60_000).toISOString()

const buyerOrg: UserOrganization = {
  id: BUYER,
  legal_name: 'Compras Loja S.A.',
  role: 'owner',
  verification_status: 'verified',
  is_buyer: true,
  is_supplier: false,
  capabilities: [
    'auction.create_reverse',
    'org.edit_profile',
    'org.manage_members',
    'org.transfer_ownership',
    'org.view',
    'participants.decide',
    'procurement.manage',
  ],
}
const supplierOrg: UserOrganization = {
  id: SUPPLIER,
  legal_name: 'Suministros del Sur',
  role: 'owner',
  verification_status: 'verified',
  is_buyer: false,
  is_supplier: true,
  capabilities: ['org.view', 'reverse.register'],
}
const asMe = (orgs: UserOrganization[]) => ({
  'GET /auth/me/': () => json(200, makeMe('user', { organizations: orgs })),
})
const page = <T,>(results: T[]) =>
  json(200, { count: results.length, next: null, previous: null, results })

const orgDetail = (over: Partial<Organization> = {}): Organization => ({
  id: BUYER,
  legal_name: 'Compras Loja S.A.',
  ruc: '1790012345001',
  is_buyer: true,
  is_supplier: false,
  verification_status: 'verified',
  verification_note: null,
  created_at: iso(-1000),
  my_role: 'owner',
  members: [
    { user_id: ME_ID, display_name: 'Ana Demo', role: 'owner', status: 'active' },
    { user_id: 'u-2', display_name: 'Beto Demo', role: 'member', status: 'active' },
  ],
  ...over,
})

const reverseInfo: ReverseInfo = {
  buyer_organization: { id: BUYER, legal_name: 'Compras Loja S.A.' },
  procurement_request_id: NEED,
  specifications: 'Papel bond 75 g/m2',
  quantity: '100.000',
  unit: 'caja',
  mandatory_requirements: [
    { code: 'R1', description: 'Factura electrónica' },
    { code: 'R2', description: 'Entrega en 48 h' },
  ],
  delivery_deadline: '2026-11-30',
  delivery_location: 'Loja, centro',
  reference_budget: '2500.00',
  min_decrement: '10.00',
  admitted_count: 1,
  legal_notice: 'Simulación de compra entre privados. No es contratación pública.',
}

const reverseDetail = (over: Partial<AuctionDetail> = {}): AuctionDetail => ({
  id: AUCTION,
  mechanism: 'reverse',
  closing_policy: 'fixed',
  status: 'active',
  result_pending: false,
  title: 'Resmas de papel A4',
  category: null,
  currency: 'USD',
  current_price: '2400.00',
  minimum_next_bid: null,
  maximum_allowed: '2390.00',
  bid_count: 1,
  active_offer_count: null,
  starts_at: iso(-10),
  ends_at: iso(120),
  proxy_enabled: false,
  description: null,
  item_condition: null,
  location_city: null,
  images: [],
  seller: { id: 'carla', display_name: 'Carla Demo', rating_avg: null, rating_count: 0 },
  starting_price: null,
  min_increment: null,
  has_reserve: false,
  reserve_met: null,
  soft_close: null,
  candle: null,
  server_time: new Date().toISOString(),
  version: 4,
  viewer: {
    is_owner: false,
    is_leader: false,
    watching: false,
    my_proxy_max: null,
    my_sealed_offer: null,
  },
  reverse: reverseInfo,
  ...over,
})

const participant = (over: Partial<Participant> = {}): Participant => ({
  id: 'p-1',
  organization: { id: SUPPLIER, legal_name: 'Suministros del Sur' },
  status: 'admitted',
  compliance: [
    { code: 'R1', complies: true, comment: 'Sí emitimos' },
    { code: 'R2', complies: false, comment: '' },
  ],
  decision_reason: null,
  registered_at: iso(-60),
  decided_at: iso(-30),
  ...over,
})

function auctionRoutes(d: () => AuctionDetail, participants: () => Participant[]) {
  return {
    [`GET /auctions/${AUCTION}/`]: () => json(200, d()),
    [`GET /auctions/${AUCTION}/live/`]: () => json(200, { ...d(), viewer_is_leader: false }),
    [`GET /auctions/${AUCTION}/bids/`]: () =>
      page([{ seq: 1, amount: '2400.00', accepted_at: iso(-5), bidder: 'Proveedor 1' }]),
    [`GET /auctions/${AUCTION}/participants/`]: () => json(200, { results: participants() }),
  }
}

describe('total de la oferta inversa', () => {
  it('replica ROUND_HALF_UP(unit × qty + envío, 2) sin flotantes', () => {
    expect(reverseTotal('24.5', '100.000', '15.00')).toBe('2465.00')
    expect(reverseTotal('0.0005', '1.000', '0')).toBe('0.00')
    expect(reverseTotal('0.005', '1.000', '0')).toBe('0.01') // medio centavo sube
    expect(reverseTotal('1.2345', '2.500', '0.10')).toBe('3.19') // 3.18625 → 3.19
    expect(reverseTotal('0.1', '3.000', '0.2')).toBe('0.50')
  })
})

describe('organizaciones (LX-53)', () => {
  it('registrar organización: validación local, POST y entrada al contexto', async () => {
    let orgs: UserOrganization[] = []
    const { calls } = fakeServer({
      'GET /auth/me/': () => json(200, makeMe('user', { organizations: orgs })),
      'POST /organizations/': (req) => {
        orgs = [{ ...buyerOrg, verification_status: 'pending', capabilities: ['org.view'] }]
        return json(201, orgDetail({ ...(req.body as object), verification_status: 'pending' }))
      },
      [`GET /organizations/${BUYER}/`]: () =>
        json(200, orgDetail({ verification_status: 'pending' })),
    })
    const user = userEvent.setup()
    renderApp('/organizaciones')

    await user.click(await screen.findByRole('button', { name: 'Registrar organización' }))
    await user.type(screen.getByLabelText('Razón social'), 'Compras Loja S.A.')
    await user.type(screen.getByLabelText('RUC'), '123')
    await user.click(screen.getByRole('button', { name: 'Registrar' }))
    expect(screen.getByText('El RUC debe tener 13 dígitos.')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)

    await user.clear(screen.getByLabelText('RUC'))
    await user.type(screen.getByLabelText('RUC'), '1790012345001')
    await user.click(screen.getByRole('button', { name: 'Registrar' }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/org/${BUYER}`))
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      legal_name: 'Compras Loja S.A.',
      ruc: '1790012345001',
      is_buyer: true,
      is_supplier: false,
    })
    expect(await screen.findByText(/Un moderador revisará los datos/)).toBeInTheDocument()
    // Pendiente: sin capacidades de compradora, no hay sección Compras.
    const tabs = screen.getByRole('navigation', { name: 'Secciones de la organización' })
    expect(within(tabs).queryByRole('link', { name: 'Compras' })).not.toBeInTheDocument()
  })

  it('organización pendiente: /compras no existe (404)', async () => {
    fakeServer({
      ...asMe([{ ...buyerOrg, verification_status: 'pending', capabilities: ['org.view'] }]),
    })
    renderApp(`/org/${BUYER}/compras/necesidades/nueva`)
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })

  it('transferir propiedad: pide contraseña, STEP_UP_FAILED la borra', async () => {
    const { calls } = fakeServer({
      ...asMe([buyerOrg]),
      [`GET /organizations/${BUYER}/`]: () => json(200, orgDetail()),
      [`POST /organizations/${BUYER}/transfer-ownership/`]: () =>
        apiError(403, 'STEP_UP_FAILED', 'La contraseña no es correcta.'),
    })
    const user = userEvent.setup()
    renderApp(`/org/${BUYER}/miembros`)

    expect(await screen.findByRole('option', { name: 'Beto Demo' })).toBeInTheDocument()
    // No puede retirarse a sí misma desde la lista.
    expect(screen.getAllByRole('button', { name: 'Retirar' })).toHaveLength(1)

    await user.selectOptions(screen.getByLabelText('Nuevo propietario'), 'u-2')
    await user.type(screen.getByLabelText('Tu contraseña'), 'secreta-123')
    await user.click(screen.getByRole('button', { name: 'Transferir' }))

    expect(await screen.findByText('La contraseña no es correcta.')).toBeInTheDocument()
    expect(screen.getByLabelText('Tu contraseña')).toHaveValue('')
    expect(calls.find((c) => c.path.endsWith('transfer-ownership/'))?.body).toEqual({
      new_owner_user_id: 'u-2',
      password: 'secreta-123',
    })
  })
})

describe('compradora (LX-53)', () => {
  it('publicar necesidad con requisitos y crear la subasta inversa publicada', async () => {
    const need: ProcurementRequest = {
      id: NEED,
      buyer_organization: { id: BUYER, legal_name: 'Compras Loja S.A.' },
      title: 'Resmas de papel A4',
      specifications: 'Papel bond 75 g/m2',
      quantity: '100.000',
      unit: 'caja',
      mandatory_requirements: [{ code: 'R1', description: 'Factura electrónica' }],
      delivery_deadline: '2099-12-31',
      delivery_location: 'Loja, centro',
      created_at: iso(0),
      auction: null,
    }
    const { calls } = fakeServer({
      ...asMe([buyerOrg]),
      'POST /procurement-requests/': () => json(201, need),
      [`GET /procurement-requests/${NEED}/`]: () => json(200, need),
      'POST /auctions/': () => json(201, reverseDetail({ status: 'draft' })),
      [`POST /auctions/${AUCTION}/publish/`]: () =>
        json(200, reverseDetail({ status: 'scheduled' })),
      ...auctionRoutes(
        () => reverseDetail({ status: 'scheduled', viewer: undefined }),
        () => [],
      ),
    })
    const user = userEvent.setup()
    renderApp(`/org/${BUYER}/compras/necesidades/nueva`)

    await user.type(await screen.findByLabelText('Título'), 'Resmas de papel A4')
    await user.type(screen.getByLabelText('Especificaciones'), 'Papel bond 75 g/m2')
    await user.type(screen.getByLabelText('Cantidad'), '100')
    await user.type(screen.getByLabelText('Unidad'), 'caja')
    await user.type(screen.getByLabelText('Entrega hasta'), '2099-12-31')
    await user.type(screen.getByLabelText('Lugar de entrega'), 'Loja, centro')
    await user.click(screen.getByRole('button', { name: 'Agregar requisito' }))
    await user.type(screen.getByLabelText('Descripción 1'), 'Factura electrónica')
    await user.click(screen.getByRole('button', { name: 'Publicar necesidad' }))

    expect(await screen.findByText(/Necesidad publicada/)).toBeInTheDocument()
    expect(calls.find((c) => c.path === '/procurement-requests/')?.body).toEqual({
      organization_id: BUYER,
      title: 'Resmas de papel A4',
      specifications: 'Papel bond 75 g/m2',
      quantity: '100',
      unit: 'caja',
      delivery_deadline: '2099-12-31',
      delivery_location: 'Loja, centro',
      mandatory_requirements: [{ code: 'R1', description: 'Factura electrónica' }],
    })

    await user.type(screen.getByLabelText('Presupuesto referencial (USD)'), '2500')
    await user.click(screen.getByRole('button', { name: 'Crear y publicar' }))

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(`/subastas/${AUCTION}`),
    )
    const body = calls.find((c) => c.method === 'POST' && c.path === '/auctions/')?.body as Record<
      string,
      unknown
    >
    expect(body).toMatchObject({
      mechanism: 'reverse',
      closing_policy: 'fixed',
      organization_id: BUYER,
      procurement_request_id: NEED,
      reference_budget: '2500.00',
      min_decrement: '1.00',
    })
    expect(body).not.toHaveProperty('listing_id')
    expect(body).not.toHaveProperty('starting_price')
    expect(calls.some((c) => c.path === `/auctions/${AUCTION}/publish/`)).toBe(true)
  })

  it('calificación: admitir directo, rechazar exige motivo', async () => {
    let status: Participant['status'] = 'registered'
    let reason: string | null = null
    const { calls } = fakeServer({
      ...asMe([buyerOrg]),
      ...auctionRoutes(
        () => reverseDetail({ status: 'scheduled', starts_at: iso(60) }),
        () => [participant({ status, decision_reason: reason })],
      ),
      [`POST /auctions/${AUCTION}/participants/p-1/decision/`]: (req) => {
        const b = req.body as { status: Participant['status']; reason?: string }
        status = b.status
        reason = b.reason ?? null
        return json(200, participant({ status, decision_reason: reason }))
      },
    })
    const user = userEvent.setup()
    renderApp(`/org/${BUYER}/compras/subastas/${AUCTION}/calificacion`)

    expect(await screen.findByText('Suministros del Sur')).toBeInTheDocument()
    expect(screen.getByText('Declara que no cumple al menos un requisito.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Rechazar' }))
    const confirm = screen.getByRole('button', { name: 'Confirmar rechazo' })
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText('Motivo del rechazo'), 'No entrega en 48 h')
    await user.click(confirm)

    expect(await screen.findByText('Motivo: No entrega en 48 h')).toBeInTheDocument()
    expect(calls.find((c) => c.path.endsWith('/decision/'))?.body).toEqual({
      status: 'rejected',
      reason: 'No entrega en 48 h',
    })

    await user.click(screen.getByRole('button', { name: 'Admitir' }))
    await waitFor(() => expect(screen.getByText('Admitida')).toBeInTheDocument())
    expect(calls.filter((c) => c.path.endsWith('/decision/')).at(-1)?.body).toEqual({
      status: 'admitted',
    })
  })

  it('en la sala, la compradora ve "Calificar proveedores" y no el formulario de oferta', async () => {
    fakeServer({
      ...asMe([buyerOrg]),
      ...auctionRoutes(
        () => reverseDetail({ status: 'scheduled', starts_at: iso(60) }),
        () => [],
      ),
    })
    renderApp(`/subastas/${AUCTION}`)
    expect(await screen.findByRole('link', { name: 'Calificar proveedores' })).toHaveAttribute(
      'href',
      `/org/${BUYER}/compras/subastas/${AUCTION}/calificacion`,
    )
    expect(screen.getByText(/No es contratación pública/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Precio unitario')).not.toBeInTheDocument()
  })
})

describe('panel de la compradora (LX-53)', () => {
  it('lista necesidades de la organización y sus inversas con ?organization=', async () => {
    const { calls } = fakeServer({
      ...asMe([buyerOrg]),
      [`GET /organizations/${BUYER}/procurement-requests/`]: () =>
        page([
          {
            id: NEED,
            buyer_organization: { id: BUYER, legal_name: 'Compras Loja S.A.' },
            title: 'Resmas de papel A4',
            specifications: 'x',
            quantity: '100.000',
            unit: 'caja',
            mandatory_requirements: [],
            delivery_deadline: '2026-11-30',
            delivery_location: 'Loja',
            created_at: iso(-60),
            auction: {
              id: AUCTION,
              status: 'scheduled',
              starts_at: iso(60),
              ends_at: iso(180),
              admitted_count: 2,
            },
          },
        ]),
      'GET /auctions/': () =>
        page([
          {
            ...reverseDetail({ status: 'scheduled', starts_at: iso(60) }),
            registrations_pending: 3,
          },
        ]),
    })
    renderApp(`/org/${BUYER}/compras`)
    expect(await screen.findByRole('link', { name: 'Resmas de papel A4' })).toHaveAttribute(
      'href',
      `/org/${BUYER}/compras/necesidades/${NEED}`,
    )
    expect(screen.getByRole('link', { name: 'Ver subasta (2 admitidos)' })).toBeInTheDocument()
    expect(await screen.findByText('3 inscripciones por revisar')).toBeInTheDocument()
    const catalog = calls.find((c) => c.path === '/auctions/')!
    expect(catalog.query.get('organization')).toBe(BUYER)
    expect(catalog.query.get('mechanism')).toBe('reverse')
    expect(catalog.query.get('mine')).toBeNull()
  })
})

describe('proveedora (LX-53)', () => {
  it('oportunidades: fase, estado de mi inscripción y enlace correcto', async () => {
    fakeServer({
      ...asMe([supplierOrg]),
      [`GET /organizations/${SUPPLIER}/opportunities/`]: () =>
        json(200, {
          results: [
            {
              auction_id: AUCTION,
              title: 'Resmas de papel A4',
              buyer_organization: 'Compras Loja S.A.',
              phase: 'registration',
              starts_at: iso(60),
              ends_at: iso(180),
              reference_budget: '2500.00',
              quantity: '100.000',
              unit: 'caja',
              my_registration: null,
            },
            {
              auction_id: 'otra',
              title: 'Sillas',
              buyer_organization: 'Otra S.A.',
              phase: 'bidding',
              starts_at: iso(-10),
              ends_at: iso(60),
              reference_budget: '900.00',
              quantity: '10.000',
              unit: 'unidad',
              my_registration: { id: 'p-9', status: 'admitted' },
            },
          ],
        }),
    })
    renderApp(`/org/${SUPPLIER}/oportunidades`)
    expect(await screen.findByRole('link', { name: /Resmas de papel A4/ })).toHaveAttribute(
      'href',
      `/org/${SUPPLIER}/oportunidades/${AUCTION}/inscripcion`,
    )
    expect(screen.getByRole('link', { name: /Sillas/ })).toHaveAttribute('href', '/subastas/otra')
    expect(screen.getByText('Tu inscripción: Admitida')).toBeInTheDocument()
    expect(screen.getByText('Sin inscribir')).toBeInTheDocument()
  })

  it('inscripción: declara cumplimiento y confirma si no cumple algo', async () => {
    let registered: Participant[] = []
    const { calls } = fakeServer({
      ...asMe([supplierOrg]),
      ...auctionRoutes(
        () => reverseDetail({ status: 'scheduled', starts_at: iso(60) }),
        () => registered,
      ),
      [`POST /auctions/${AUCTION}/participants/`]: (req) => {
        const b = req.body as { compliance: Participant['compliance'] }
        registered = [participant({ status: 'registered', compliance: b.compliance })]
        return json(201, registered[0])
      },
    })
    const user = userEvent.setup()
    renderApp(`/org/${SUPPLIER}/oportunidades/${AUCTION}/inscripcion`)

    const r1 = (await screen.findAllByRole('checkbox', { name: 'Cumplimos este requisito' }))[0]!
    await user.click(r1)
    await user.type(screen.getByLabelText('Comentario sobre R1'), ' Emitimos factura ')
    await user.click(screen.getByRole('button', { name: 'Inscribirme' }))
    expect(screen.getByText(/Declaras que no cumples al menos un requisito/)).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Confirmar inscripción' }))
    expect(await screen.findByText('Pendiente de revisión')).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      organization_id: SUPPLIER,
      compliance: [
        { code: 'R1', complies: true, comment: 'Emitimos factura' },
        { code: 'R2', complies: false, comment: '' },
      ],
    })
  })

  it('sala: vista previa local, total oficial del servidor, confirmación e Idempotency-Key', async () => {
    let rejectNext = true
    const { calls } = fakeServer({
      ...asMe([supplierOrg]),
      ...auctionRoutes(
        () => reverseDetail(),
        () => [participant()],
      ),
      [`POST /auctions/${AUCTION}/reverse-quote/`]: (req) => {
        const b = req.body as { unit_price: string; shipping_cost: string }
        const total = reverseTotal(b.unit_price, '100.000', b.shipping_cost)
        return json(200, {
          total,
          maximum_allowed: '2390.00',
          within_maximum: Number(total) <= 2390,
          formula: 'ROUND_HALF_UP(unit_price × quantity + shipping_cost, 2)',
        })
      },
      [`POST /auctions/${AUCTION}/bids/`]: () => {
        if (rejectNext) {
          rejectNext = false
          return apiError(409, 'OFFER_ABOVE_MAXIMUM', 'El total supera el máximo permitido.', {
            maximum_allowed: '2380.00',
          })
        }
        return json(201, {
          bid: { seq: 2, amount: '2380.00', source: 'manual', accepted_at: iso(0) },
          auction: {
            current_price: '2380.00',
            viewer_is_leader: true,
            version: 5,
            ends_at: iso(120),
          },
          outbid_by_proxy: false,
        })
      },
    })
    const user = userEvent.setup()
    renderApp(`/subastas/${AUCTION}`)

    expect(await screen.findByText('Historial de ofertas')).toBeInTheDocument()
    expect(await screen.findByText('Proveedor 1')).toBeInTheDocument()

    const unit = await screen.findByLabelText('Precio unitario')
    await user.type(unit, '23.9')
    expect(screen.getByText('$2.390,00')).toBeInTheDocument() // 23.9 × 100 + 0

    await user.clear(unit)
    await user.type(unit, '24')
    await user.click(screen.getByRole('button', { name: 'Revisar oferta' }))
    expect(screen.getByText(/El total no puede superar/)).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)

    await user.clear(unit)
    await user.type(unit, '23.8')
    await user.click(screen.getByRole('button', { name: 'Revisar oferta' }))
    const confirm = await screen.findByRole('button', { name: 'Confirmar oferta de $2.380,00' })
    expect(screen.getByText(/Total oficial calculado por el servidor/)).toBeInTheDocument()
    expect(calls.some((c) => c.path.endsWith('/bids/') && c.method === 'POST')).toBe(false)

    await user.click(confirm)
    expect(await screen.findByText(/Ahora el máximo es/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirmar oferta de $2.380,00' }))
    expect(await screen.findByText(/Oferta de \$2\.380,00 aceptada/)).toBeInTheDocument()

    const posts = calls.filter((c) => c.method === 'POST' && c.path.endsWith('/bids/'))
    expect(posts).toHaveLength(2)
    expect(posts[0]!.body).toEqual({
      unit_price: '23.8',
      shipping_cost: '0.00',
      organization_id: SUPPLIER,
    })
    const k1 = posts[0]!.headers.get('Idempotency-Key')
    const k2 = posts[1]!.headers.get('Idempotency-Key')
    expect(k1).toBeTruthy()
    expect(k2).toBeTruthy()
    expect(k1).not.toBe(k2) // un rechazo de negocio no reutiliza la clave

    // Cambiar un valor invalida la confirmación: vuelve a pedir el total oficial.
    await user.type(unit, '23.7')
    expect(screen.getByRole('button', { name: 'Revisar oferta' })).toBeInTheDocument()
  })

  it('sala: organización no admitida no ve el formulario', async () => {
    fakeServer({
      ...asMe([supplierOrg]),
      ...auctionRoutes(
        () => reverseDetail(),
        () => [participant({ status: 'rejected', decision_reason: 'not_reviewed' })],
      ),
    })
    renderApp(`/subastas/${AUCTION}`)
    expect(
      await screen.findByText(
        'Tu organización no está admitida en esta subasta: no puede ofertar.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/No se revisó antes del inicio/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Precio unitario')).not.toBeInTheDocument()
  })
})
