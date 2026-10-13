import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { fetchModerationSummary, modKeys } from '@/features/moderation/api'
import { cn } from '@/lib/utils'

function Counter({
  label,
  value,
  to,
  urgent,
}: {
  label: string
  value: number
  to?: string
  urgent?: boolean
}) {
  const body = (
    <>
      <span
        className={cn('text-2xl font-semibold tabular-nums', urgent && value > 0 && 'text-red-700')}
      >
        {value}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </>
  )
  const cls = 'flex flex-col gap-1 rounded-xl border bg-card p-4 shadow-xs'
  return to ? (
    <Link
      to={to}
      aria-label={`${label}: ${value}`}
      className={cn(cls, 'hover:border-foreground/30')}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** `/moderacion`: bandeja con contadores (`GET /moderation/summary/`). */
export function Inbox() {
  const summary = useQuery({
    queryKey: modKeys.summary,
    queryFn: ({ signal }) => fetchModerationSummary(signal),
    refetchInterval: 30_000,
  })
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Bandeja de moderación</h1>
      {summary.isPending ? (
        <PageLoading />
      ) : summary.isError ? (
        <ErrorAlert error={summary.error} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Counter
            label="Organizaciones pendientes"
            value={summary.data.pending_organizations}
            to="/moderacion/organizaciones"
            urgent
          />
          <Counter
            label="Reportes abiertos"
            value={summary.data.open_reports}
            to="/moderacion/reportes"
            urgent
          />
          <Counter
            label="Subastas activas reportadas"
            value={summary.data.reported_active_auctions}
            to="/moderacion/reportes"
            urgent
          />
          <Counter label="Subastas activas" value={summary.data.active_auctions} />
          <Counter label="Usuarios suspendidos" value={summary.data.suspended_users} />
        </div>
      )}
    </section>
  )
}
