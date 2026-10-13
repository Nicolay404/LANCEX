import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { isApiError } from '@/api/errors'
import { ErrorAlert } from '@/components/ErrorAlert'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import {
  createReport,
  DETAIL_MAX,
  REPORT_REASONS,
  type ReportReason,
  type ReportTarget,
} from './api'

const TARGET_LABEL: Record<ReportTarget, string> = {
  auction: 'esta subasta',
  listing: 'esta publicación',
  user: 'este usuario',
}

/**
 * Botón + modal "Reportar" (LX-38). Quien lo muestra decide la visibilidad con la capacidad
 * `report.create`; el backend valida dueño, límites (10/día) y duplicados (ALREADY_REPORTED).
 */
export function ReportButton({
  targetType,
  targetId,
  className,
}: {
  targetType: ReportTarget
  targetId: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  if (done) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)} role="status">
        Reporte enviado. Gracias.
      </p>
    )
  }
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn('text-muted-foreground', className)}
        onClick={() => setOpen(true)}
      >
        Reportar {TARGET_LABEL[targetType].split(' ')[1]}
      </Button>
      {open && (
        <ReportDialog
          targetType={targetType}
          targetId={targetId}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false)
            setDone(true)
          }}
        />
      )}
    </>
  )
}

function ReportDialog({
  targetType,
  targetId,
  onClose,
  onDone,
}: {
  targetType: ReportTarget
  targetId: string
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState<ReportReason | ''>('')
  const [detail, setDetail] = useState('')
  const [clientError, setClientError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: () =>
      createReport({
        target_type: targetType,
        target_id: targetId,
        reason: reason as ReportReason,
        detail: detail.trim(),
      }),
    onSuccess: onDone,
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setClientError(null)
    if (!reason) return setClientError('Elige un motivo.')
    if (reason === 'other' && detail.trim().length < 10) {
      return setClientError('Cuéntanos el motivo en el detalle (al menos 10 caracteres).')
    }
    mutation.mutate()
  }

  const already = isApiError(mutation.error) && mutation.error.code === 'ALREADY_REPORTED'

  return (
    <Modal title={`Reportar ${TARGET_LABEL[targetType]}`} onClose={onClose}>
      {already ? (
        <div className="space-y-4">
          <Alert>
            Ya reportaste {TARGET_LABEL[targetType]}. El equipo de moderación lo está revisando.
          </Alert>
          <Button type="button" onClick={onDone}>
            Entendido
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Motivo</legend>
            {REPORT_REASONS.map((r) => (
              <label
                key={r.value}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-lg border p-3 text-sm',
                  reason === r.value && 'border-foreground',
                )}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">{r.label}</span>
                  <span className="block text-xs text-muted-foreground">{r.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="report-detail">Detalle {reason === 'other' ? '' : '(opcional)'}</Label>
            <Textarea
              id="report-detail"
              rows={4}
              maxLength={DETAIL_MAX}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {detail.length}/{DETAIL_MAX}. No incluyas datos personales de terceros.
            </p>
          </div>
          {clientError && (
            <p className="text-sm text-destructive" role="alert">
              {clientError}
            </p>
          )}
          {mutation.isError && (
            <ErrorAlert error={mutation.error} title="No se pudo enviar el reporte" />
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Enviando…' : 'Enviar reporte'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
