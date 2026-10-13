import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router'

import { isApiError } from '@/api/errors'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import {
  decideOrganization,
  fetchOrganizationReview,
  fetchOrganizationsForReview,
  modKeys,
} from '@/features/moderation/api'
import { MEMBER_ROLE_LABEL, VERIFICATION_LABEL } from '@/features/organizations/types'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'

import { Pager, ReasonAction } from './shared'

const TABS = [
  { status: 'pending', label: 'Pendientes' },
  { status: 'verified', label: 'Verificadas' },
  { status: 'rejected', label: 'Rechazadas' },
] as const

/** `/moderacion/organizaciones` (capacidad `moderation.verify_organizations`). */
export function OrganizationsReviewPage() {
  const [params, setParams] = useSearchParams()
  const current = TABS.find((t) => t.status === params.get('estado')) ?? TABS[0]
  const page = Math.max(1, Number(params.get('page')) || 1)
  const list = useQuery({
    queryKey: modKeys.orgs(current.status, page),
    queryFn: ({ signal }) => fetchOrganizationsForReview(current.status, page, signal),
    placeholderData: keepPreviousData,
  })
  const go = (status: string, p = 1) => {
    const next = new URLSearchParams()
    if (status !== 'pending') next.set('estado', status)
    if (p > 1) next.set('page', String(p))
    setParams(next, { replace: true })
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Verificación de organizaciones</h1>
      <div role="tablist" aria-label="Estado" className="flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.status}
            role="tab"
            type="button"
            aria-selected={t === current}
            onClick={() => go(t.status)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm',
              t === current ? 'bg-accent font-medium' : 'text-muted-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {list.isPending ? (
        <PageLoading />
      ) : list.isError ? (
        <ErrorAlert error={list.error} />
      ) : list.data.results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hay organizaciones en este estado.
        </p>
      ) : (
        <>
          <ul className="divide-y rounded-xl border">
            {list.data.results.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <Link
                    to={`/moderacion/organizaciones/${o.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {o.legal_name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    RUC {o.ruc} ·{' '}
                    {[o.is_buyer && 'Compradora', o.is_supplier && 'Proveedora']
                      .filter(Boolean)
                      .join(' y ')}{' '}
                    · registrada {formatDateTime(o.created_at)} por {o.created_by.display_name}
                  </p>
                </div>
                <span className="rounded bg-muted px-2 py-0.5 text-xs">
                  {VERIFICATION_LABEL[o.verification_status] ?? o.verification_status}
                </span>
              </li>
            ))}
          </ul>
          <Pager
            hasPrev={!!list.data.previous}
            hasNext={!!list.data.next}
            page={page}
            onPage={(p) => go(current.status, p)}
          />
        </>
      )}
    </section>
  )
}

/** `/moderacion/organizaciones/:orgId`: datos, miembros (con email) y decisión con nota. */
export function OrganizationReviewPage() {
  const { orgId = '' } = useParams()
  const queryClient = useQueryClient()
  const detail = useQuery({
    queryKey: modKeys.org(orgId),
    queryFn: ({ signal }) => fetchOrganizationReview(orgId, signal),
  })
  const decide = useMutation({
    mutationFn: (v: { status: 'verified' | 'rejected'; note: string }) =>
      decideOrganization(orgId, v.status, v.note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modKeys.all })
    },
  })

  if (detail.isPending) return <PageLoading />
  if (detail.isError) {
    if (isApiError(detail.error) && detail.error.status === 404) return <NotFoundPage />
    return <ErrorAlert error={detail.error} />
  }
  const o = detail.data
  const lastDecision = decide.isSuccess ? decide.data.verification_status : null

  return (
    <section className="max-w-3xl space-y-5">
      <Link
        to="/moderacion/organizaciones"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Organizaciones
      </Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{o.legal_name}</h1>
        <p className="text-sm text-muted-foreground">
          {VERIFICATION_LABEL[o.verification_status] ?? o.verification_status}
          {o.verification_note && ` · Nota: ${o.verification_note}`}
        </p>
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">RUC</dt>
        <dd className="tabular-nums">{o.ruc}</dd>
        <dt className="text-muted-foreground">Tipo</dt>
        <dd>
          {[o.is_buyer && 'Compradora', o.is_supplier && 'Proveedora'].filter(Boolean).join(' y ')}
        </dd>
        <dt className="text-muted-foreground">Registrada</dt>
        <dd>
          {formatDateTime(o.created_at)} por{' '}
          <Link
            to={`/moderacion/usuarios/${o.created_by.id}`}
            className="underline underline-offset-2"
          >
            {o.created_by.display_name}
          </Link>
        </dd>
      </dl>

      <div className="space-y-2">
        <h2 className="text-lg font-medium">Miembros</h2>
        <ul className="divide-y rounded-lg border text-sm">
          {o.members.map((m) => (
            <li key={m.user_id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
              <span>
                <Link
                  to={`/moderacion/usuarios/${m.user_id}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {m.display_name}
                </Link>{' '}
                <span className="text-muted-foreground">{m.email}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {MEMBER_ROLE_LABEL[m.role] ?? m.role} ·{' '}
                {m.status === 'active' ? 'activo' : m.status}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {lastDecision && (
        <Alert variant="success">
          {lastDecision === 'verified'
            ? 'Organización verificada. Se avisó a sus propietarios.'
            : 'Organización rechazada. Se avisó a sus propietarios con la nota.'}
        </Alert>
      )}
      <div className="flex flex-wrap items-start gap-3">
        {o.verification_status !== 'verified' && (
          <ReasonAction
            id="verify-note"
            trigger="Verificar"
            label="Nota de verificación"
            confirmLabel="Confirmar verificación"
            pendingLabel="Guardando…"
            placeholder="Ej.: RUC validado en el SRI."
            destructive={false}
            pending={decide.isPending}
            error={decide.variables?.status === 'verified' ? decide.error : null}
            onConfirm={(note) => decide.mutate({ status: 'verified', note })}
          />
        )}
        {o.verification_status !== 'rejected' && (
          <ReasonAction
            id="reject-note"
            trigger="Rechazar"
            label="Motivo del rechazo (lo verán sus propietarios)"
            confirmLabel="Confirmar rechazo"
            pendingLabel="Guardando…"
            pending={decide.isPending}
            error={decide.variables?.status === 'rejected' ? decide.error : null}
            onConfirm={(note) => decide.mutate({ status: 'rejected', note })}
          />
        )}
      </div>
    </section>
  )
}
