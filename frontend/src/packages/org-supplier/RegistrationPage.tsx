import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'

import { isApiError } from '@/api/errors'
import type { UserOrganization } from '@/api/types'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { auctionKeys, fetchAuction } from '@/features/auctions/api'
import { Countdown } from '@/features/auctions/Countdown'
import { fetchParticipants, registerParticipant, reverseKeys } from '@/features/reverse/api'
import { NeedSummary } from '@/features/reverse/NeedSummary'
import {
  PARTICIPANT_STATUS_LABEL,
  rejectionText,
  type ComplianceItem,
  type Requirement,
} from '@/features/reverse/types'

/** `/org/:orgId/oportunidades/:auctionId/inscripcion` (capacidad `reverse.register`). */
export function RegistrationPage({ org }: { org: UserOrganization }) {
  const { auctionId = '' } = useParams()
  const auction = useQuery({
    queryKey: auctionKeys.detail(auctionId),
    queryFn: ({ signal }) => fetchAuction(auctionId, signal),
  })
  const participants = useQuery({
    queryKey: reverseKeys.participants(auctionId),
    queryFn: ({ signal }) => fetchParticipants(auctionId, signal),
    enabled: auction.data?.mechanism === 'reverse',
  })

  if (auction.isPending) return <PageLoading />
  if (auction.isError) {
    if (isApiError(auction.error) && auction.error.status === 404) return <NotFoundPage />
    return <ErrorAlert error={auction.error} />
  }
  const a = auction.data
  if (!a.reverse) return <NotFoundPage />
  const mine = participants.data?.results.find((p) => p.organization.id === org.id)
  const ownAuction = a.reverse.buyer_organization.id === org.id

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
      <section className="space-y-4">
        <Link
          to={`/org/${org.id}/oportunidades`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Oportunidades
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{a.title ?? 'Subasta inversa'}</h1>
        <Alert>{a.reverse.legal_notice}</Alert>
        <NeedSummary
          need={a.reverse}
          budget={a.reverse.reference_budget}
          minDecrement={a.reverse.min_decrement}
        />
        <Link to={`/subastas/${a.id}`} className="text-sm underline underline-offset-4">
          Ver la sala de la subasta
        </Link>
      </section>
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        {participants.isPending ? (
          <PageLoading />
        ) : participants.isError ? (
          <ErrorAlert error={participants.error} />
        ) : mine ? (
          <div className="space-y-2 rounded-xl border p-5">
            <h2 className="font-medium">Inscripción de {org.legal_name}</h2>
            <p className="text-sm">
              Estado: <strong>{PARTICIPANT_STATUS_LABEL[mine.status] ?? mine.status}</strong>
            </p>
            {mine.status === 'rejected' && rejectionText(mine.decision_reason) && (
              <p className="text-sm text-muted-foreground">
                Motivo: {rejectionText(mine.decision_reason)}
              </p>
            )}
            {mine.status === 'admitted' && (
              <p className="text-sm text-muted-foreground">
                Podrás ofertar desde la sala cuando la subasta empiece.
              </p>
            )}
          </div>
        ) : ownAuction ? (
          <Alert>Esta subasta es de tu organización: no puede inscribirse como proveedora.</Alert>
        ) : a.status !== 'scheduled' ? (
          <Alert>La inscripción está cerrada.</Alert>
        ) : (
          <RegistrationForm
            orgId={org.id}
            orgName={org.legal_name}
            auctionId={a.id}
            startsAt={a.starts_at}
            requirements={a.reverse.mandatory_requirements}
          />
        )}
      </aside>
    </div>
  )
}

function RegistrationForm({
  orgId,
  orgName,
  auctionId,
  startsAt,
  requirements,
}: {
  orgId: string
  orgName: string
  auctionId: string
  startsAt: string | null
  requirements: Requirement[]
}) {
  const queryClient = useQueryClient()
  const [items, setItems] = useState<ComplianceItem[]>(
    requirements.map((r) => ({ code: r.code, complies: false, comment: '' })),
  )
  const [confirmNonCompliance, setConfirmNonCompliance] = useState(false)
  const mutation = useMutation({
    mutationFn: () =>
      registerParticipant(
        auctionId,
        orgId,
        items.map((i) => ({ ...i, comment: i.comment.trim() })),
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: reverseKeys.participants(auctionId) }),
  })
  const failing = items.some((i) => !i.complies)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (failing && !confirmNonCompliance) {
      setConfirmNonCompliance(true)
      return
    }
    mutation.mutate()
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-4 rounded-xl border bg-card p-5 shadow-xs"
    >
      <h2 className="font-medium">Inscribir a {orgName}</h2>
      <p className="text-xs text-muted-foreground">
        Cierra al inicio de la subasta (
        <Countdown target={startsAt} prefix="en" elapsedLabel="cerrada" />
        ). La compradora revisará tu declaración.
      </p>
      {requirements.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Esta necesidad no tiene requisitos obligatorios.
        </p>
      )}
      {requirements.map((r, idx) => (
        <fieldset key={r.code} className="space-y-2 border-t pt-3">
          <legend className="text-sm">
            <span className="mr-1 font-mono text-xs">{r.code}</span>
            {r.description}
          </legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={items[idx]!.complies}
              onChange={(e) => {
                setConfirmNonCompliance(false)
                setItems(
                  items.map((x, j) => (j === idx ? { ...x, complies: e.target.checked } : x)),
                )
              }}
            />
            Cumplimos este requisito
          </label>
          <Input
            aria-label={`Comentario sobre ${r.code}`}
            placeholder="Comentario (opcional)"
            maxLength={300}
            value={items[idx]!.comment}
            onChange={(e) =>
              setItems(items.map((x, j) => (j === idx ? { ...x, comment: e.target.value } : x)))
            }
          />
        </fieldset>
      ))}
      {confirmNonCompliance && (
        <Alert>
          Declaras que no cumples al menos un requisito; la compradora puede rechazarte. Pulsa de
          nuevo para confirmar.
        </Alert>
      )}
      {mutation.isError && <ErrorAlert error={mutation.error} title="No se pudo inscribir" />}
      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending
          ? 'Inscribiendo…'
          : confirmNonCompliance
            ? 'Confirmar inscripción'
            : 'Inscribirme'}
      </Button>
    </form>
  )
}
