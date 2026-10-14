import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { isApiError } from '@/api/errors'
import type { UserOrganization } from '@/api/types'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { auctionKeys, fetchAuction } from '@/features/auctions/api'
import { Countdown } from '@/features/auctions/Countdown'
import { StatusBadge } from '@/features/auctions/StatusBadge'
import { decideParticipant, fetchParticipants, reverseKeys } from '@/features/reverse/api'
import {
  PARTICIPANT_STATUS_LABEL,
  rejectionText,
  type Participant,
  type Requirement,
} from '@/features/reverse/types'
import { formatDateTime } from '@/lib/dates'

/** `/org/:orgId/compras/subastas/:auctionId/calificacion` (capacidad `participants.decide`). */
export function QualificationPage({ org }: { org: UserOrganization }) {
  const { auctionId = '' } = useParams()
  const auction = useQuery({
    queryKey: auctionKeys.detail(auctionId),
    queryFn: ({ signal }) => fetchAuction(auctionId, signal),
  })
  const participants = useQuery({
    queryKey: reverseKeys.participants(auctionId),
    queryFn: ({ signal }) => fetchParticipants(auctionId, signal),
    enabled: auction.data?.reverse?.buyer_organization.id === org.id,
    refetchInterval: 15_000,
  })

  if (auction.isPending) return <PageLoading />
  if (auction.isError) {
    if (isApiError(auction.error) && auction.error.status === 404) return <NotFoundPage />
    return <ErrorAlert error={auction.error} />
  }
  const a = auction.data
  if (!a.reverse || a.reverse.buyer_organization.id !== org.id) return <NotFoundPage />
  const open = a.status === 'scheduled'

  return (
    <section className="space-y-5">
      <Link to={`/org/${org.id}/compras`} className="text-sm text-muted-foreground hover:underline">
        ← Compras
      </Link>
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Calificación de proveedores</h1>
          <StatusBadge status={a.status} resultPending={a.result_pending} />
        </div>
        <p className="text-sm text-muted-foreground">
          <Link to={`/subastas/${a.id}`} className="underline underline-offset-2">
            {a.title ?? 'Subasta inversa'}
          </Link>
          {' · inicio '}
          {formatDateTime(a.starts_at)}
        </p>
      </header>
      {open ? (
        <Alert>
          Decide antes del inicio (
          <Countdown target={a.starts_at} prefix="faltan" elapsedLabel="empezando" />
          ). Las inscripciones sin revisar quedan rechazadas automáticamente.
        </Alert>
      ) : a.status === 'draft' ? (
        <Alert>Publica la subasta para abrir la inscripción de proveedores.</Alert>
      ) : (
        <Alert>La calificación está cerrada: la subasta ya empezó.</Alert>
      )}

      {participants.isPending ? (
        <PageLoading />
      ) : participants.isError ? (
        <ErrorAlert error={participants.error} />
      ) : participants.data.results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Todavía no hay proveedores inscritos.
        </p>
      ) : (
        <ul className="space-y-3">
          {participants.data.results.map((p) => (
            <ParticipantCard
              key={p.id}
              auctionId={a.id}
              participant={p}
              requirements={a.reverse!.mandatory_requirements}
              canDecide={open}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function ParticipantCard({
  auctionId,
  participant: p,
  requirements,
  canDecide,
}: {
  auctionId: string
  participant: Participant
  requirements: Requirement[]
  canDecide: boolean
}) {
  const queryClient = useQueryClient()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: (status: 'admitted' | 'rejected') =>
      decideParticipant(auctionId, p.id, status, reason.trim()),
    onSuccess: () => {
      setRejecting(false)
      setReason('')
      void queryClient.invalidateQueries({ queryKey: reverseKeys.participants(auctionId) })
      void queryClient.invalidateQueries({ queryKey: auctionKeys.detail(auctionId) })
    },
  })
  const description = (code: string) => requirements.find((r) => r.code === code)?.description
  const failsSome = p.compliance.some((c) => !c.complies)

  return (
    <li className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{p.organization.legal_name}</p>
        <span className="rounded bg-muted px-2 py-0.5 text-xs">
          {PARTICIPANT_STATUS_LABEL[p.status] ?? p.status}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">Inscrita {formatDateTime(p.registered_at)}</p>
      {p.compliance.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Requisito</th>
              <th className="py-1 font-medium">Cumple</th>
              <th className="py-1 font-medium">Comentario</th>
            </tr>
          </thead>
          <tbody>
            {p.compliance.map((c) => (
              <tr key={c.code} className="border-t align-top">
                <td className="py-1 pr-2">
                  <span className="font-mono text-xs">{c.code}</span> {description(c.code)}
                </td>
                <td className={c.complies ? 'py-1 pr-2' : 'py-1 pr-2 text-destructive'}>
                  {c.complies ? 'Sí' : 'No'}
                </td>
                <td className="py-1 text-muted-foreground">{c.comment || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {failsSome && p.status !== 'rejected' && (
        <p className="text-xs text-amber-300">Declara que no cumple al menos un requisito.</p>
      )}
      {p.status === 'rejected' && rejectionText(p.decision_reason) && (
        <p className="text-sm text-muted-foreground">Motivo: {rejectionText(p.decision_reason)}</p>
      )}
      {canDecide &&
        (rejecting ? (
          <div className="space-y-2">
            <Label htmlFor={`reason-${p.id}`}>Motivo del rechazo</Label>
            <Textarea
              id={`reason-${p.id}`}
              rows={2}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Se notificará al proveedor."
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={reason.trim().length < 3 || mutation.isPending}
                onClick={() => mutation.mutate('rejected')}
              >
                {mutation.isPending ? 'Enviando…' : 'Confirmar rechazo'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRejecting(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {p.status !== 'admitted' && (
              <Button
                size="sm"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate('admitted')}
              >
                Admitir
              </Button>
            )}
            {p.status !== 'rejected' && (
              <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
                Rechazar
              </Button>
            )}
          </div>
        ))}
      {mutation.isError && <ErrorAlert error={mutation.error} title="No se pudo guardar" />}
    </li>
  )
}
