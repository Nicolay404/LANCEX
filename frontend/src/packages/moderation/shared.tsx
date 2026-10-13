import { useState, type ReactNode } from 'react'

import { ErrorAlert } from '@/components/ErrorAlert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/dates'
import type { AuditRow } from '@/features/moderation/types'

const REASON_MIN = 3
const REASON_MAX = 300

/**
 * Acción de staff que exige motivo (≥ 3 caracteres): primero se abre, luego se confirma.
 * El motivo queda en la auditoría del backend.
 */
export function ReasonAction({
  id,
  trigger,
  label,
  confirmLabel,
  pendingLabel,
  placeholder,
  destructive = true,
  pending,
  error,
  onConfirm,
  children,
}: {
  id: string
  trigger: string
  label: string
  confirmLabel: string
  pendingLabel: string
  placeholder?: string
  destructive?: boolean
  pending: boolean
  error: unknown
  onConfirm: (reason: string) => void
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const tooShort = reason.trim().length < REASON_MIN
  if (!open) {
    return (
      <Button variant={destructive ? 'outline' : 'default'} size="sm" onClick={() => setOpen(true)}>
        {trigger}
      </Button>
    )
  }
  return (
    <div className="space-y-2 rounded-xl border p-4">
      {children}
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={3}
        maxLength={REASON_MAX}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={placeholder}
      />
      {tooShort && (
        <p className="text-xs text-muted-foreground">Escribe al menos {REASON_MIN} caracteres.</p>
      )}
      {!!error && <ErrorAlert error={error} />}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={destructive ? 'destructive' : 'default'}
          disabled={tooShort || pending}
          onClick={() => onConfirm(reason.trim())}
        >
          {pending ? pendingLabel : confirmLabel}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
          Volver
        </Button>
      </div>
    </div>
  )
}

export function Pager({
  hasPrev,
  hasNext,
  page,
  onPage,
}: {
  hasPrev: boolean
  hasNext: boolean
  page: number
  onPage: (p: number) => void
}) {
  if (!hasPrev && !hasNext) return null
  return (
    <nav aria-label="Páginas" className="flex items-center justify-center gap-3">
      <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => onPage(page - 1)}>
        Anterior
      </Button>
      <span className="text-sm text-muted-foreground">Página {page}</span>
      <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => onPage(page + 1)}>
        Siguiente
      </Button>
    </nav>
  )
}

/** Eventos de auditoría tal como los entrega el backend (staff), con `request_id` para Firestore. */
export function AuditList({ events, empty }: { events: AuditRow[]; empty: string }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Hora</th>
            <th className="px-3 py-2 font-medium">Acción</th>
            <th className="px-3 py-2 font-medium">Datos</th>
            <th className="px-3 py-2 font-medium">request_id</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-t align-top">
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                {formatDateTime(e.occurred_at)}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{e.action}</td>
              <td className="max-w-md px-3 py-2 font-mono text-xs break-words text-muted-foreground">
                {Object.keys(e.data ?? {}).length > 0 ? JSON.stringify(e.data) : '—'}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                {e.request_id ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
