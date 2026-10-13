import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { fakeServer, json, makeMe } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

import type {
  ModerationAuction,
  ModerationReport,
  OrganizationReviewDetail,
  UserFile,
} from './types'

const asMod = { 'GET /auth/me/': () => json(200, makeMe('moderator')) }
const page = <T,>(results: T[]) =>
  json(200, { count: results.length, next: null, previous: null, results })
const iso = (m: number) => new Date(Date.now() + m * 60_000).toISOString()
const AUCTION = '66666666-6666-4666-8666-666666666666'
const ORG = '77777777-7777-4777-8777-777777777777'
const USER = '88888888-8888-4888-8888-888888888888'

const report = (over: Partial<ModerationReport> = {}): ModerationReport => ({
  id: 'r-1',
  target_type: 'auction',
  target_id: AUCTION,
  reason: 'fraud',
  detail: 'Pide pago por fuera',
  status: 'open',
  reporter: { id: 'u-rep', display_name: 'Ana Demo' },
  resolution_note: null,
  created_at: iso(-60),
  resolved_at: null,
  ...over,
})

describe('moderación (LX-78)', () => {
  it('bandeja con contadores enlazados; un usuario común no tiene /moderacion', async () => {
    fakeServer({
      ...asMod,
      'GET /moderation/summary/': () =>
        json(200, {
          pending_organizations: 2,
          open_reports: 3,
          active_auctions: 7,
          suspended_users: 1,
          reported_active_auctions: 1,
        }),
    })
    const { unmount } = renderApp('/moderacion')
    expect(
      await screen.findByRole('link', { name: 'Organizaciones pendientes: 2' }),
    ).toHaveAttribute('href', '/moderacion/organizaciones')
    expect(screen.getByRole('link', { name: 'Reportes abiertos: 3' })).toHaveAttribute(
      'href',
      '/moderacion/reportes',
    )
    expect(screen.getByText('Usuarios suspendidos')).toBeInTheDocument()
    unmount()

    fakeServer({ 'GET /auth/me/': () => json(200, makeMe('user')) })
    renderApp('/moderacion/reportes')
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })

  it('verificación: miembros con email y rechazo con nota obligatoria', async () => {
    const detail: OrganizationReviewDetail = {
      id: ORG,
      legal_name: 'Ferretería Ana',
      ruc: '1100110011001',
      is_buyer: false,
      is_supplier: true,
      verification_status: 'pending',
      verification_note: null,
      created_at: iso(-100),
      created_by: { id: USER, display_name: 'Ana Demo' },
      members: [
        {
          user_id: USER,
          display_name: 'Ana Demo',
          email: 'ana@demo.lancex.test',
          role: 'owner',
          status: 'active',
        },
      ],
    }
    const { calls } = fakeServer({
      ...asMod,
      'GET /moderation/organizations/': () => page([detail]),
      [`GET /moderation/organizations/${ORG}/`]: () => json(200, detail),
      [`POST /moderation/organizations/${ORG}/decision/`]: (req) =>
        json(200, { ...detail, ...(req.body as object) }),
    })
    const user = userEvent.setup()
    renderApp('/moderacion/organizaciones')

    await user.click(await screen.findByRole('link', { name: 'Ferretería Ana' }))
    expect(await screen.findByText('ana@demo.lancex.test')).toBeInTheDocument()
    expect(calls.find((c) => c.path === '/moderation/organizations/')?.query.get('status')).toBe(
      'pending',
    )

    await user.click(screen.getByRole('button', { name: 'Rechazar' }))
    const confirm = screen.getByRole('button', { name: 'Confirmar rechazo' })
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText(/Motivo del rechazo/), 'RUC no coincide')
    await user.click(confirm)
    expect(await screen.findByText(/Organización rechazada/)).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      status: 'rejected',
      note: 'RUC no coincide',
    })
  })

  it('reportes: cancelar la subasta reportada envía actioned + cancel_auction con nota', async () => {
    let current = report()
    const { calls } = fakeServer({
      ...asMod,
      'GET /moderation/reports/': () => page([current]),
      'POST /moderation/reports/r-1/resolve/': (req) => {
        const b = req.body as { status: ModerationReport['status']; note: string }
        current = report({ status: b.status, resolution_note: b.note, resolved_at: iso(0) })
        return json(200, current)
      },
    })
    const user = userEvent.setup()
    renderApp('/moderacion/reportes')

    const card = (await screen.findByText('Pide pago por fuera')).closest('li')!
    expect(within(card).getByText('Subasta: Fraude o estafa')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Vista de moderación' })).toHaveAttribute(
      'href',
      `/moderacion/subastas/${AUCTION}`,
    )
    await user.click(within(card).getByRole('button', { name: 'Resolver' }))
    await user.selectOptions(within(card).getByLabelText('Resolución'), 'cancel_auction')
    await user.type(within(card).getByLabelText(/Nota/), 'Fraude confirmado')
    await user.click(within(card).getByRole('button', { name: 'Confirmar resolución' }))

    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
        status: 'actioned',
        note: 'Fraude confirmado',
        action: 'cancel_auction',
      }),
    )
    expect(calls.find((c) => c.path === '/moderation/reports/')?.query.get('status')).toBe('open')
  })

  it('reporte de publicación: no ofrece cancelar subasta; descartar envía dismissed + none', async () => {
    const { calls } = fakeServer({
      ...asMod,
      'GET /moderation/reports/': () =>
        page([report({ target_type: 'listing', target_id: 'l-1' })]),
      'POST /moderation/reports/r-1/resolve/': () => json(200, report({ status: 'dismissed' })),
    })
    const user = userEvent.setup()
    renderApp('/moderacion/reportes')
    await user.click(await screen.findByRole('button', { name: 'Resolver' }))
    const select = screen.getByLabelText('Resolución')
    expect(within(select).queryByRole('option', { name: 'Cancelar la subasta' })).toBeNull()
    await user.type(screen.getByLabelText(/Nota/), 'Sin evidencia')
    await user.click(screen.getByRole('button', { name: 'Confirmar resolución' }))
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
        status: 'dismissed',
        note: 'Sin evidencia',
        action: 'none',
      }),
    )
  })

  it('vista de moderación: identidades, reserva, auditoría y cancelar con motivo', async () => {
    const data: ModerationAuction = {
      auction: {
        id: AUCTION,
        mechanism: 'ascending',
        closing_policy: 'fixed',
        status: 'active',
        outcome: null,
        owner: { id: USER, display_name: 'Beto Demo' },
        current_price: '120.00',
        reserve_price: '150.00',
        bid_count: 1,
        active_offer_count: null,
        starts_at: iso(-60),
        ends_at: iso(60),
        winner_user_id: null,
        final_price: null,
        cancel_reason: null,
      },
      bids: [
        {
          seq: 1,
          amount: '120.00',
          source: 'manual',
          accepted_at: iso(-5),
          counted: null,
          bidder: { id: 'u-c', display_name: 'Carla Demo' },
        },
      ],
      sealed_offers: [],
      audit_events: [
        {
          id: 1,
          occurred_at: iso(-5),
          actor_user_id: 'u-c',
          action: 'bid_accepted',
          entity_type: 'bid',
          entity_id: null,
          auction_id: AUCTION,
          request_id: 'req-abc',
          data: { seq: 1, amount: '120.00' },
        },
      ],
    }
    const { calls } = fakeServer({
      ...asMod,
      [`GET /moderation/auctions/${AUCTION}/`]: () => json(200, data),
      [`POST /moderation/auctions/${AUCTION}/cancel/`]: () =>
        json(200, { id: AUCTION, status: 'cancelled', cancel_reason: 'Fraude' }),
    })
    const user = userEvent.setup()
    renderApp(`/moderacion/subastas/${AUCTION}`)

    expect(await screen.findByRole('link', { name: 'Carla Demo' })).toBeInTheDocument()
    expect(screen.getByText('$150,00')).toBeInTheDocument()
    expect(screen.getByText('req-abc')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar subasta' }))
    await user.type(screen.getByLabelText(/Motivo de la cancelación/), 'Fraude')
    await user.click(screen.getByRole('button', { name: 'Confirmar cancelación' }))
    expect(await screen.findByText(/Subasta cancelada/)).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ reason: 'Fraude' })
  })

  it('ficha: suspende con motivo; un moderador no puede suspender a otro moderador', async () => {
    const file = (role: string): UserFile => ({
      user: {
        id: USER,
        email: 'beto@demo.lancex.test',
        display_name: 'Beto Demo',
        platform_role: role,
        status: 'active',
        status_reason: null,
        created_at: iso(-1000),
        last_login: iso(-10),
      },
      auctions_owned: 2,
      bids_placed: 5,
      reports_received: 1,
      reports_made: 0,
      recent_events: [],
    })
    let role = 'user'
    const { calls } = fakeServer({
      ...asMod,
      [`GET /moderation/users/${USER}/`]: () => json(200, file(role)),
      [`POST /moderation/users/${USER}/suspend/`]: () =>
        json(200, { ...file(role).user, status: 'suspended', status_reason: 'Fraude' }),
    })
    const user = userEvent.setup()
    const { unmount } = renderApp(`/moderacion/usuarios/${USER}`)

    expect(await screen.findByText(/beto@demo.lancex.test/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Suspender cuenta' }))
    await user.type(screen.getByLabelText('Motivo de la suspensión'), 'Fraude')
    await user.click(screen.getByRole('button', { name: 'Confirmar suspensión' }))
    expect(await screen.findByText(/Cuenta suspendida/)).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ reason: 'Fraude' })
    unmount()

    role = 'moderator'
    renderApp(`/moderacion/usuarios/${USER}`)
    expect(await screen.findByText(/beto@demo.lancex.test/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Suspender cuenta' })).not.toBeInTheDocument()
  })
})
