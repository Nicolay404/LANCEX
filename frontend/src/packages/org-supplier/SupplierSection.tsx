import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, useRoutes } from 'react-router'

import type { UserOrganization } from '@/api/types'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Countdown } from '@/features/auctions/Countdown'
import { fetchOpportunities, fetchRegistrations, reverseKeys } from '@/features/reverse/api'
import { formatQuantity } from '@/features/reverse/format'
import { PARTICIPANT_STATUS_LABEL, rejectionText } from '@/features/reverse/types'
import { formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

import { RegistrationPage } from './RegistrationPage'

/**
 * Paquete `org-supplier` (LX-53): oportunidades inversas, inscripción con declaración de
 * cumplimiento y mis inscripciones. Solo se descarga si la organización es proveedora verificada.
 */
export default function SupplierSection({ org }: { org: UserOrganization }) {
  return useRoutes([
    { index: true, element: <Opportunities org={org} /> },
    { path: 'inscripciones', element: <Registrations org={org} /> },
    { path: ':auctionId/inscripcion', element: <RegistrationPage org={org} /> },
    { path: '*', element: <NotFoundPage /> },
  ])
}

function SubNav({ org }: { org: UserOrganization }) {
  const cls = ({ isActive }: { isActive: boolean }) =>
    cn(
      'rounded-md px-3 py-1.5 text-sm',
      isActive ? 'bg-accent font-medium' : 'text-muted-foreground',
    )
  return (
    <nav aria-label="Proveedora" className="flex gap-1">
      <NavLink to={`/org/${org.id}/oportunidades`} end className={cls}>
        Abiertas
      </NavLink>
      <NavLink to={`/org/${org.id}/oportunidades/inscripciones`} className={cls}>
        Mis inscripciones
      </NavLink>
    </nav>
  )
}

function Opportunities({ org }: { org: UserOrganization }) {
  const list = useQuery({
    queryKey: reverseKeys.opportunities(org.id),
    queryFn: ({ signal }) => fetchOpportunities(org.id, signal),
    refetchInterval: 30_000,
  })
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Oportunidades</h1>
      <SubNav org={org} />
      <p className="text-sm text-muted-foreground">
        Subastas inversas en inscripción o en curso. No aparecen las de organizaciones a las que
        perteneces (conflicto de interés). Solo si la compradora te admite podrás ofertar.
      </p>
      {list.isPending ? (
        <PageLoading />
      ) : list.isError ? (
        <ErrorAlert error={list.error} />
      ) : list.data.results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hay subastas inversas abiertas en este momento.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {list.data.results.map((o) => {
            const registering = o.phase === 'registration'
            const to =
              registering && !o.my_registration
                ? `/org/${org.id}/oportunidades/${o.auction_id}/inscripcion`
                : `/subastas/${o.auction_id}`
            return (
              <li key={o.auction_id}>
                <Link
                  to={to}
                  className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4 shadow-xs hover:border-foreground/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-medium">{o.title ?? 'Subasta inversa'}</h2>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">
                      {registering ? 'Inscripción' : 'En curso'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[
                      o.buyer_organization,
                      o.quantity && `${formatQuantity(o.quantity)} ${o.unit ?? ''}`.trim(),
                      o.reference_budget && `presupuesto ${formatMoney(o.reference_budget)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="text-sm">
                    {o.my_registration
                      ? `Tu inscripción: ${PARTICIPANT_STATUS_LABEL[o.my_registration.status] ?? o.my_registration.status}`
                      : registering
                        ? 'Sin inscribir'
                        : 'No inscrita: no puede ofertar'}
                  </p>
                  <p className="mt-auto text-xs text-muted-foreground tabular-nums">
                    <Countdown
                      target={registering ? o.starts_at : o.ends_at}
                      prefix={registering ? 'La inscripción cierra en' : 'Termina en'}
                      elapsedLabel={registering ? 'Empezando…' : 'Cerrando…'}
                    />
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Registrations({ org }: { org: UserOrganization }) {
  const list = useQuery({
    queryKey: reverseKeys.registrations(org.id),
    queryFn: ({ signal }) => fetchRegistrations(org.id, signal),
  })
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Mis inscripciones</h1>
      <SubNav org={org} />
      {list.isPending ? (
        <PageLoading />
      ) : list.isError ? (
        <ErrorAlert error={list.error} />
      ) : list.data.results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Tu organización todavía no se ha inscrito en ninguna subasta.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {list.data.results.map((r) => (
            <li key={r.id} className="space-y-1 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  to={`/subastas/${r.auction.id}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {r.auction.title ?? 'Subasta inversa'}
                </Link>
                <span className="rounded bg-muted px-2 py-0.5 text-xs">
                  {PARTICIPANT_STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Inicio {formatDateTime(r.auction.starts_at)} · fin{' '}
                {formatDateTime(r.auction.ends_at)}
              </p>
              {r.status === 'rejected' && rejectionText(r.decision_reason) && (
                <p className="text-sm text-muted-foreground">
                  Motivo: {rejectionText(r.decision_reason)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
