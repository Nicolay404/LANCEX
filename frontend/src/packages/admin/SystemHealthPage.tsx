import { useQuery } from '@tanstack/react-query'

import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { adminKeys, fetchSystemHealth } from '@/features/admin/api'
import { formatDateTime } from '@/lib/dates'

/** `/admin/sistema` (capacidad `admin.view_system_health`): latidos del job de cierre y conteos. */
export function SystemHealthPage() {
  const health = useQuery({
    queryKey: adminKeys.health,
    queryFn: ({ signal }) => fetchSystemHealth(signal),
    refetchInterval: 15_000,
  })
  if (health.isPending) return <PageLoading />
  if (health.isError) return <ErrorAlert error={health.error} />
  const h = health.data
  const allStale = h.close_jobs.length === 0 || h.close_jobs.every((j) => j.stale)
  const counts: [string, number][] = [
    ['Usuarios', h.counts.users],
    ['Subastas abiertas', h.counts.open_auctions],
    ['Subastas cerradas', h.counts.closed_auctions],
    ['Reportes abiertos', h.counts.open_reports],
    ['Cierres pendientes', h.pending_closes],
  ]
  return (
    <section className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Hora del servidor: {formatDateTime(h.server_time)}
      </p>
      {allStale && (
        <Alert variant="destructive">
          Ningún backend está ejecutando el cierre automático (`close_due_auctions --loop`). Las
          subastas vencidas se cerrarán al consultarse, pero conviene levantarlo.
        </Alert>
      )}
      {h.pending_closes > 0 && !allStale && (
        <Alert>
          Hay {h.pending_closes} subastas vencidas esperando cierre; el job las procesará en breve.
        </Alert>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {counts.map(([label, value]) => (
          <li key={label} className="rounded-xl border p-3">
            <p className="text-xl font-semibold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </li>
        ))}
      </ul>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Cierre automático por backend</h2>
        {h.close_jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún backend ha reportado todavía.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {h.close_jobs.map((j) => (
              <li
                key={`${j.dev}-${j.job}`}
                className="flex flex-wrap justify-between gap-2 px-3 py-2"
              >
                <span>
                  <strong>{j.dev}</strong> <span className="font-mono text-xs">{j.job}</span>
                </span>
                <span className={j.stale ? 'text-red-300' : 'text-muted-foreground'}>
                  {j.stale ? 'Sin latido · ' : ''}último {formatDateTime(j.last_run_at)} ·{' '}
                  {j.last_closed_count} cerradas
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
