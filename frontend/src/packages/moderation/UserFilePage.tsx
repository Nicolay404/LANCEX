import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'

import { isApiError } from '@/api/errors'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { PLATFORM_ROLE_LABEL } from '@/features/auth/capabilities'
import { useMe } from '@/features/auth/session'
import { fetchUserFile, modKeys, suspendUser } from '@/features/moderation/api'
import { ACCOUNT_STATUS_LABEL } from '@/features/moderation/types'
import { formatDateTime } from '@/lib/dates'

import { AuditList, ReasonAction } from './shared'

/** `/moderacion/usuarios/:userId` (capacidad `moderation.suspend_user`): ficha y suspensión. */
export function UserFilePage() {
  const { userId = '' } = useParams()
  const me = useMe()
  const queryClient = useQueryClient()
  const file = useQuery({
    queryKey: modKeys.user(userId),
    queryFn: ({ signal }) => fetchUserFile(userId, signal),
  })
  const suspend = useMutation({
    mutationFn: (reason: string) => suspendUser(userId, reason),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: modKeys.all }),
  })

  if (file.isPending) return <PageLoading />
  if (file.isError) {
    if (isApiError(file.error) && file.error.status === 404) return <NotFoundPage />
    return <ErrorAlert error={file.error} />
  }
  const { user: u } = file.data
  // Reglas del backend (ROLES §4): nadie se suspende a sí mismo, un admin no se suspende y solo
  // un admin suspende a un moderador. Aquí solo se evita ofrecer lo que seguro fallará.
  const canSuspend =
    u.status !== 'suspended' &&
    u.id !== me?.id &&
    u.platform_role !== 'admin' &&
    (u.platform_role !== 'moderator' || me?.platform_role === 'admin')

  const counters: [string, number][] = [
    ['Subastas creadas', file.data.auctions_owned],
    ['Pujas', file.data.bids_placed],
    ['Reportes recibidos', file.data.reports_received],
    ['Reportes enviados', file.data.reports_made],
  ]

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{u.display_name}</h1>
        <p className="text-sm text-muted-foreground">
          {u.email} · {PLATFORM_ROLE_LABEL[u.platform_role] ?? u.platform_role} ·{' '}
          <Link to={`/usuarios/${u.id}`} className="underline underline-offset-2">
            perfil público
          </Link>
        </p>
      </header>

      <dl className="grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Estado</dt>
        <dd className={u.status === 'suspended' ? 'font-medium text-red-700' : undefined}>
          {ACCOUNT_STATUS_LABEL[u.status] ?? u.status}
          {u.status_reason && ` · ${u.status_reason}`}
        </dd>
        <dt className="text-muted-foreground">Cuenta creada</dt>
        <dd>{formatDateTime(u.created_at)}</dd>
        <dt className="text-muted-foreground">Último ingreso</dt>
        <dd>{u.last_login ? formatDateTime(u.last_login) : '—'}</dd>
      </dl>

      <ul className="grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
        {counters.map(([label, value]) => (
          <li key={label} className="rounded-xl border p-3">
            <p className="text-xl font-semibold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </li>
        ))}
      </ul>

      {suspend.isSuccess && (
        <Alert variant="success">
          Cuenta suspendida. Se cerraron sus sesiones y se aplicaron los efectos de la suspensión.
        </Alert>
      )}
      {canSuspend && !suspend.isSuccess && (
        <ReasonAction
          id="suspend-reason"
          trigger="Suspender cuenta"
          label="Motivo de la suspensión"
          confirmLabel="Confirmar suspensión"
          pendingLabel="Suspendiendo…"
          pending={suspend.isPending}
          error={suspend.error}
          onConfirm={(reason) => suspend.mutate(reason)}
        >
          <p className="text-sm text-muted-foreground">
            Se cierran sus sesiones, se cancelan sus subastas en borrador o programadas y se retiran
            sus pujas automáticas y ofertas selladas vigentes. Las pujas ya hechas se mantienen.
          </p>
        </ReasonAction>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Actividad reciente</h2>
        <AuditList events={file.data.recent_events} empty="Sin actividad registrada." />
      </section>
    </section>
  )
}
