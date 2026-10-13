import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import type { UserOrganization } from '@/api/types'
import { ErrorAlert } from '@/components/ErrorAlert'
import { FormField } from '@/components/FormField'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { OrgCap } from '@/features/auth/capabilities'
import { ME_QUERY_KEY, useMe } from '@/features/auth/session'
import {
  addMember,
  fetchOrganization,
  orgKeys,
  removeMember,
  transferOwnership,
} from '@/features/organizations/api'
import { MEMBER_ROLE_LABEL, type Organization } from '@/features/organizations/types'

/** `/org/:orgId/miembros`: lista; la gestión solo con `org.manage_members` / `org.transfer_ownership`. */
export function MembersPage({ org }: { org: UserOrganization }) {
  const me = useMe()
  const detail = useQuery({
    queryKey: orgKeys.detail(org.id),
    queryFn: ({ signal }) => fetchOrganization(org.id, signal),
  })
  const canManage = org.capabilities.includes(OrgCap.ORG_MANAGE_MEMBERS)
  const canTransfer = org.capabilities.includes(OrgCap.ORG_TRANSFER_OWNERSHIP)

  if (detail.isPending) return <PageLoading />
  if (detail.isError) return <ErrorAlert error={detail.error} />
  const active = detail.data.members.filter((m) => m.status === 'active')

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Miembros</h1>
      <ul className="divide-y rounded-xl border">
        {active.map((m) => (
          <MemberRow
            key={m.user_id}
            orgId={org.id}
            member={m}
            isMe={m.user_id === me?.id}
            canRemove={canManage && m.user_id !== me?.id}
          />
        ))}
      </ul>
      {canManage && <AddMember orgId={org.id} />}
      {canTransfer && (
        <TransferOwnership
          org={detail.data}
          candidates={active.filter((m) => m.user_id !== me?.id)}
        />
      )}
    </section>
  )
}

function MemberRow({
  orgId,
  member,
  isMe,
  canRemove,
}: {
  orgId: string
  member: Organization['members'][number]
  isMe: boolean
  canRemove: boolean
}) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const mutation = useMutation({
    mutationFn: () => removeMember(orgId, member.user_id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: orgKeys.detail(orgId) }),
  })
  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-medium">{member.display_name}</span>
          {isMe && <span className="text-muted-foreground"> (tú)</span>}
          <span className="ml-2 text-xs text-muted-foreground">
            {MEMBER_ROLE_LABEL[member.role] ?? member.role}
          </span>
        </p>
        {canRemove &&
          (confirming ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? 'Retirando…' : 'Confirmar'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
              Retirar
            </Button>
          ))}
      </div>
      {mutation.isError && <ErrorAlert error={mutation.error} title="No se pudo retirar" />}
    </li>
  )
}

function AddMember({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const mutation = useMutation({
    mutationFn: () => addMember(orgId, email.trim()),
    onSuccess: (org) => {
      queryClient.setQueryData(orgKeys.detail(orgId), org)
      setEmail('')
    },
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (email.trim()) mutation.mutate()
  }
  return (
    <form onSubmit={submit} noValidate className="max-w-xl space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">Agregar miembro</h2>
      <FormField label="Email de la persona" hint="Debe tener una cuenta activa en LANCEX.">
        {(p) => (
          <Input
            {...p}
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </FormField>
      {mutation.isError && <ErrorAlert error={mutation.error} title="No se pudo agregar" />}
      {mutation.isSuccess && <Alert variant="success">Miembro agregado.</Alert>}
      <Button type="submit" disabled={mutation.isPending || !email.trim()}>
        {mutation.isPending ? 'Agregando…' : 'Agregar'}
      </Button>
    </form>
  )
}

/** Step-up: la contraseña se envía una vez y no se guarda en ningún estado persistente. */
function TransferOwnership({
  org,
  candidates,
}: {
  org: Organization
  candidates: Organization['members']
}) {
  const queryClient = useQueryClient()
  const [target, setTarget] = useState('')
  const [password, setPassword] = useState('')
  const mutation = useMutation({
    mutationFn: () => transferOwnership(org.id, target, password),
    onSuccess: async (updated) => {
      setPassword('')
      queryClient.setQueryData(orgKeys.detail(org.id), updated)
      // Cambian las capacidades del usuario en esta organización.
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
    },
    onError: () => setPassword(''),
  })
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Para transferir la propiedad, primero agrega a otro miembro.
      </p>
    )
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (target && password) mutation.mutate()
  }
  return (
    <form onSubmit={submit} noValidate className="max-w-xl space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">Transferir propiedad</h2>
      <p className="text-sm text-muted-foreground">
        La otra persona pasa a ser propietaria y tú quedas como miembro.
      </p>
      <FormField label="Nuevo propietario">
        {(p) => (
          <NativeSelect {...p} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Elige un miembro…</option>
            {candidates.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField label="Tu contraseña" hint="Confirma tu identidad para este cambio.">
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </FormField>
      {mutation.isError && <ErrorAlert error={mutation.error} title="No se pudo transferir" />}
      {mutation.isSuccess && <Alert variant="success">Propiedad transferida.</Alert>}
      <Button type="submit" disabled={mutation.isPending || !target || !password}>
        {mutation.isPending ? 'Transfiriendo…' : 'Transferir'}
      </Button>
    </form>
  )
}
