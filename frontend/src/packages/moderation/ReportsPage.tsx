import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { fetchReports, modKeys, resolveReport } from '@/features/moderation/api'
import {
  REPORT_STATUS_LABEL,
  REPORT_TARGET_LABEL,
  RESOLVE_ACTION_LABEL,
  type ModerationReport,
  type ReportStatus,
  type ResolveAction,
} from '@/features/moderation/types'
import { REPORT_REASONS } from '@/features/reports/api'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'

import { Pager } from './shared'

const TABS: { status: ReportStatus | ''; label: string }[] = [
  { status: 'open', label: 'Abiertos' },
  { status: 'actioned', label: 'Con acción' },
  { status: 'dismissed', label: 'Descartados' },
  { status: '', label: 'Todos' },
]

const reasonLabel = (r: string) => REPORT_REASONS.find((x) => x.value === r)?.label ?? r

/** `/moderacion/reportes` (capacidad `moderation.review_reports`). */
export function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const current = TABS.find((t) => t.status === (params.get('estado') ?? 'open')) ?? TABS[0]!
  const page = Math.max(1, Number(params.get('page')) || 1)
  const list = useQuery({
    queryKey: modKeys.reports(current.status, page),
    queryFn: ({ signal }) => fetchReports(current.status, page, signal),
    placeholderData: keepPreviousData,
  })
  const go = (status: string, p = 1) => {
    const next = new URLSearchParams()
    if (status !== 'open') next.set('estado', status)
    if (p > 1) next.set('page', String(p))
    setParams(next, { replace: true })
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
      <div role="tablist" aria-label="Estado" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.label}
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
          No hay reportes en este estado.
        </p>
      ) : (
        <>
          <ul className="space-y-3">
            {list.data.results.map((r) => (
              <ReportCard key={r.id} report={r} />
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

function TargetLink({ r }: { r: ModerationReport }) {
  if (r.target_type === 'auction') {
    return (
      <>
        <Link to={`/moderacion/subastas/${r.target_id}`} className="underline underline-offset-2">
          Vista de moderación
        </Link>
        {' · '}
        <Link to={`/subastas/${r.target_id}`} className="underline underline-offset-2">
          Página pública
        </Link>
      </>
    )
  }
  if (r.target_type === 'user') {
    return (
      <Link to={`/moderacion/usuarios/${r.target_id}`} className="underline underline-offset-2">
        Ficha del usuario
      </Link>
    )
  }
  return <span className="font-mono text-xs">{r.target_id}</span>
}

function ReportCard({ report: r }: { report: ModerationReport }) {
  return (
    <li className="space-y-2 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {REPORT_TARGET_LABEL[r.target_type] ?? r.target_type}: {reasonLabel(r.reason)}
        </p>
        <span className="rounded bg-muted px-2 py-0.5 text-xs">
          {REPORT_STATUS_LABEL[r.status] ?? r.status}
        </span>
      </div>
      <p className="text-sm">
        <TargetLink r={r} />
      </p>
      {/* Texto plano del reportante: nunca HTML. */}
      {r.detail && <p className="text-sm whitespace-pre-line text-muted-foreground">{r.detail}</p>}
      <p className="text-xs text-muted-foreground">
        Reportado por{' '}
        <Link to={`/moderacion/usuarios/${r.reporter.id}`} className="underline underline-offset-2">
          {r.reporter.display_name}
        </Link>{' '}
        el {formatDateTime(r.created_at)}
        {r.resolved_at && ` · resuelto el ${formatDateTime(r.resolved_at)}`}
      </p>
      {r.resolution_note && <p className="text-sm">Nota: {r.resolution_note}</p>}
      {r.status === 'open' && <ResolveForm report={r} />}
    </li>
  )
}

function ResolveForm({ report: r }: { report: ModerationReport }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState<ResolveAction>('none')
  const [note, setNote] = useState('')
  const mutation = useMutation({
    mutationFn: () =>
      resolveReport(r.id, {
        status: action === 'none' ? 'dismissed' : 'actioned',
        note: note.trim(),
        action,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: modKeys.all }),
  })
  const actions: ResolveAction[] =
    r.target_type === 'auction'
      ? ['none', 'cancel_auction', 'suspend_user']
      : ['none', 'suspend_user']
  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Resolver
      </Button>
    )
  }
  const tooShort = note.trim().length < 3
  return (
    <div className="space-y-2 border-t pt-3">
      <Label htmlFor={`action-${r.id}`}>Resolución</Label>
      <NativeSelect
        id={`action-${r.id}`}
        value={action}
        onChange={(e) => setAction(e.target.value as ResolveAction)}
      >
        {actions.map((a) => (
          <option key={a} value={a}>
            {RESOLVE_ACTION_LABEL[a]}
          </option>
        ))}
      </NativeSelect>
      {action === 'suspend_user' && r.target_type !== 'user' && (
        <p className="text-xs text-muted-foreground">
          Se suspende al dueño de la {r.target_type === 'auction' ? 'subasta' : 'publicación'}.
        </p>
      )}
      <Label htmlFor={`note-${r.id}`}>Nota (queda en la auditoría)</Label>
      <Textarea
        id={`note-${r.id}`}
        rows={2}
        maxLength={300}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {mutation.isError && <ErrorAlert error={mutation.error} title="No se pudo resolver" />}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={action === 'none' ? 'default' : 'destructive'}
          disabled={tooShort || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Guardando…' : 'Confirmar resolución'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
          Volver
        </Button>
      </div>
    </div>
  )
}
