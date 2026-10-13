import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'

import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { adminKeys, fetchAuditEvents, type AuditFilters } from '@/features/admin/api'
import { fromGuayaquilInput } from '@/lib/dates'

import { AuditList, Pager } from '../moderation/shared'

const KEYS = ['auction_id', 'actor_id', 'action', 'from', 'to'] as const
const LABEL: Record<(typeof KEYS)[number], string> = {
  auction_id: 'ID de subasta',
  actor_id: 'ID de usuario (actor)',
  action: 'Acción (ej. bid_accepted)',
  from: 'Desde (hora de Ecuador)',
  to: 'Hasta (hora de Ecuador)',
}

/** `/admin/auditoria` (capacidad `admin.view_audit`): filtros en la URL; `request_id` para Firestore. */
export function AuditPage() {
  const [params, setParams] = useSearchParams()
  const form: AuditFilters = {
    auction_id: params.get('auction_id') ?? '',
    actor_id: params.get('actor_id') ?? '',
    action: params.get('action') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  }
  const page = Math.max(1, Number(params.get('page')) || 1)
  // Las fechas viajan en la URL como `datetime-local` (hora de Ecuador) y al backend en ISO.
  const filters: AuditFilters = {
    ...form,
    from: form.from ? (fromGuayaquilInput(form.from) ?? '') : '',
    to: form.to ? (fromGuayaquilInput(form.to) ?? '') : '',
  }
  const [draft, setDraft] = useState(form)
  const list = useQuery({
    queryKey: adminKeys.audit(filters, page),
    queryFn: ({ signal }) => fetchAuditEvents(filters, page, signal),
    placeholderData: keepPreviousData,
  })
  const apply = (values: AuditFilters, p = 1) => {
    const next = new URLSearchParams()
    for (const k of KEYS) if (values[k].trim()) next.set(k, values[k].trim())
    if (p > 1) next.set('page', String(p))
    setParams(next, { replace: true })
  }
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    apply(draft)
  }

  return (
    <section className="space-y-4">
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5" role="search">
        {KEYS.map((k) => (
          <div key={k} className="space-y-1.5">
            <Label htmlFor={`audit-${k}`}>{LABEL[k]}</Label>
            <Input
              id={`audit-${k}`}
              type={k === 'from' || k === 'to' ? 'datetime-local' : 'text'}
              value={draft[k]}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
            />
          </div>
        ))}
        <div className="flex gap-2 sm:col-span-3 lg:col-span-5">
          <Button type="submit">Filtrar</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const empty = { auction_id: '', actor_id: '', action: '', from: '', to: '' }
              setDraft(empty)
              apply(empty)
            }}
          >
            Limpiar
          </Button>
        </div>
      </form>
      {list.isPending ? (
        <PageLoading />
      ) : list.isError ? (
        <ErrorAlert error={list.error} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{list.data.count} eventos</p>
          <AuditList events={list.data.results} empty="Ningún evento coincide con los filtros." />
          <Pager
            hasPrev={!!list.data.previous}
            hasNext={!!list.data.next}
            page={page}
            onPage={(p) => apply(form, p)}
          />
        </>
      )}
    </section>
  )
}
