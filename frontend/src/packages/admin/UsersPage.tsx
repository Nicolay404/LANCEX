import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'

import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import {
  adminKeys,
  changeRole,
  fetchAdminUsers,
  issuePasswordReset,
  reactivateUser,
  resetUserMfa,
} from '@/features/admin/api'
import { PLATFORM_ROLE_LABEL } from '@/features/auth/capabilities'
import { ME_QUERY_KEY, useMe } from '@/features/auth/session'
import { ACCOUNT_STATUS_LABEL, type StaffUserRow } from '@/features/moderation/types'
import { formatDateTime } from '@/lib/dates'

import { Pager } from '../moderation/shared'

/**
 * `/admin/usuarios` (capacidad `admin.manage_users`): buscar, reactivar, cambiar rol y recuperar
 * el acceso (enlace de restablecimiento de contraseña y quitar la verificación en dos pasos).
 */
export function UsersPage() {
  const [params, setParams] = useSearchParams()
  const filters = {
    q: params.get('q') ?? '',
    role: params.get('rol') ?? '',
    status: params.get('estado') ?? '',
  }
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [q, setQ] = useState(filters.q)
  const list = useQuery({
    queryKey: adminKeys.users(filters, page),
    queryFn: ({ signal }) => fetchAdminUsers(filters, page, signal),
    placeholderData: keepPreviousData,
  })
  const update = (changes: Record<string, string>, p = 1) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (p > 1) next.set('page', String(p))
    else next.delete('page')
    setParams(next, { replace: true })
  }
  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    update({ q: q.trim() })
  }

  return (
    <section className="space-y-4">
      <form onSubmit={onSearch} className="flex flex-wrap items-end gap-3" role="search">
        <div className="space-y-1.5">
          <Label htmlFor="user-q">Nombre o email</Label>
          <Input id="user-q" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="user-role">Rol</Label>
          <NativeSelect
            id="user-role"
            value={filters.role}
            onChange={(e) => update({ rol: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="user">Usuario</option>
            <option value="moderator">Moderador</option>
            <option value="admin">Administrador</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="user-status">Estado</Label>
          <NativeSelect
            id="user-status"
            value={filters.status}
            onChange={(e) => update({ estado: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="active">Activa</option>
            <option value="suspended">Suspendida</option>
          </NativeSelect>
        </div>
        <Button type="submit">Buscar</Button>
      </form>
      {list.isPending ? (
        <PageLoading />
      ) : list.isError ? (
        <ErrorAlert error={list.error} />
      ) : list.data.results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Ningún usuario coincide.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {list.data.results.map((u) => (
              <UserRow key={u.id} u={u} />
            ))}
          </ul>
          <Pager
            hasPrev={!!list.data.previous}
            hasNext={!!list.data.next}
            page={page}
            onPage={(p) => update({}, p)}
          />
        </>
      )}
    </section>
  )
}

function UserRow({ u }: { u: StaffUserRow }) {
  const me = useMe()
  const [mode, setMode] = useState<'idle' | 'reactivate' | 'role' | 'reset' | 'mfa'>('idle')
  return (
    <li className="space-y-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {u.display_name}
            {u.id === me?.id && <span className="text-muted-foreground"> (tú)</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {u.email} · {PLATFORM_ROLE_LABEL[u.platform_role] ?? u.platform_role} · creada{' '}
            {formatDateTime(u.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              u.status === 'suspended'
                ? 'rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-300'
                : 'rounded bg-muted px-2 py-0.5 text-xs'
            }
          >
            {ACCOUNT_STATUS_LABEL[u.status] ?? u.status}
          </span>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/moderacion/usuarios/${u.id}`}>Ficha</Link>
          </Button>
          {u.status === 'suspended' && mode === 'idle' && (
            <Button size="sm" variant="outline" onClick={() => setMode('reactivate')}>
              Reactivar
            </Button>
          )}
          {u.id !== me?.id && mode === 'idle' && (
            <>
              <Button size="sm" variant="outline" onClick={() => setMode('role')}>
                Cambiar rol
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMode('reset')}>
                Restablecer contraseña
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMode('mfa')}>
                Quitar verificación en dos pasos
              </Button>
            </>
          )}
        </div>
      </div>
      {u.status === 'suspended' && u.status_reason && (
        <p className="text-xs text-muted-foreground">Motivo de la suspensión: {u.status_reason}</p>
      )}
      {mode === 'reactivate' && <ReactivateForm u={u} onDone={() => setMode('idle')} />}
      {mode === 'role' && <RoleForm u={u} onDone={() => setMode('idle')} />}
      {(mode === 'reset' || mode === 'mfa') && (
        <AccessRecoveryForm u={u} action={mode} onDone={() => setMode('idle')} />
      )}
    </li>
  )
}

/**
 * Recuperar el acceso de un usuario sin correo: enlace de un solo uso (30 min) o quitar su 2FA.
 * Motivo + contraseña del admin (step-up). El enlace se muestra una vez y no se guarda.
 */
function AccessRecoveryForm({
  u,
  action,
  onDone,
}: {
  u: StaffUserRow
  action: 'reset' | 'mfa'
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [password, setPassword] = useState('')
  const [copied, setCopied] = useState(false)
  const mutation = useMutation({
    mutationFn: async () => {
      if (action === 'reset') return issuePasswordReset(u.id, reason.trim(), password)
      await resetUserMfa(u.id, reason.trim(), password)
      return null
    },
    onSettled: () => setPassword(''),
  })
  const link = mutation.data ? `${window.location.origin}${mutation.data.reset_path}` : null
  const ready = reason.trim().length >= 3 && password
  const title =
    action === 'reset'
      ? 'Enlace para restablecer la contraseña'
      : 'Quitar verificación en dos pasos'

  return (
    <div className="max-w-xl space-y-2 border-t pt-2">
      <p className="text-sm font-medium">{title}</p>
      {mutation.isSuccess ? (
        link ? (
          <div className="space-y-2">
            <Alert variant="success">
              Entrega este enlace a {u.display_name} por un canal privado. Sirve una sola vez y
              vence {formatDateTime(mutation.data!.expires_at)}. No se volverá a mostrar.
            </Alert>
            <Input readOnly aria-label="Enlace de restablecimiento" value={link} />
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void navigator.clipboard?.writeText(link).then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }
            >
              {copied ? 'Copiado' : 'Copiar enlace'}
            </Button>
          </div>
        ) : (
          <Alert variant="success">
            Se quitó la verificación en dos pasos de {u.display_name} y se cerraron sus sesiones.
            Podrá ingresar solo con su contraseña y volver a activarla.
          </Alert>
        )
      ) : (
        <>
          {action === 'mfa' && (
            <p className="text-xs text-muted-foreground">
              Úsalo solo si perdió su teléfono y sus códigos de respaldo, tras confirmar su
              identidad.
            </p>
          )}
          <Label htmlFor={`rec-reason-${action}-${u.id}`}>Motivo</Label>
          <Textarea
            id={`rec-reason-${action}-${u.id}`}
            rows={2}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Label htmlFor={`rec-pw-${action}-${u.id}`}>Tu contraseña</Label>
          <Input
            id={`rec-pw-${action}-${u.id}`}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mutation.isError && <ErrorAlert error={mutation.error} title="No se pudo completar" />}
        </>
      )}
      <div className="flex gap-2">
        {!mutation.isSuccess && (
          <Button
            size="sm"
            variant={action === 'mfa' ? 'destructive' : 'default'}
            disabled={!ready || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? 'Procesando…'
              : action === 'reset'
                ? 'Generar enlace'
                : 'Quitar verificación'}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onDone}>
          {mutation.isSuccess ? 'Cerrar' : 'Volver'}
        </Button>
      </div>
    </div>
  )
}

function ReactivateForm({ u, onDone }: { u: StaffUserRow; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: () => reactivateUser(u.id, reason.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.all })
      onDone()
    },
  })
  return (
    <div className="space-y-2 border-t pt-2">
      <Label htmlFor={`react-${u.id}`}>Motivo de la reactivación</Label>
      <Textarea
        id={`react-${u.id}`}
        rows={2}
        maxLength={300}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {mutation.isError && <ErrorAlert error={mutation.error} />}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={reason.trim().length < 3 || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Reactivando…' : 'Confirmar reactivación'}
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>
          Volver
        </Button>
      </div>
    </div>
  )
}

/** Cambio de rol: motivo + contraseña del admin (step-up). Pasa a staff solo sin actividad abierta. */
function RoleForm({ u, onDone }: { u: StaffUserRow; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [role, setRole] = useState('')
  const [reason, setReason] = useState('')
  const [password, setPassword] = useState('')
  const mutation = useMutation({
    mutationFn: () => changeRole(u.id, role, reason.trim(), password),
    onSuccess: () => {
      setPassword('')
      void queryClient.invalidateQueries({ queryKey: adminKeys.all })
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
    },
    onError: () => setPassword(''),
  })
  const options = ['user', 'moderator', 'admin'].filter((r) => r !== u.platform_role)
  const ready = role && reason.trim().length >= 3 && password
  return (
    <div className="max-w-md space-y-2 border-t pt-2">
      {mutation.isSuccess ? (
        <Alert variant="success">
          Rol actualizado a {PLATFORM_ROLE_LABEL[mutation.data.platform_role]}. Se cerraron sus
          sesiones para que vuelva a entrar con sus nuevos permisos.
        </Alert>
      ) : (
        <>
          <Label htmlFor={`role-${u.id}`}>Nuevo rol</Label>
          <NativeSelect id={`role-${u.id}`} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Elige…</option>
            {options.map((r) => (
              <option key={r} value={r}>
                {PLATFORM_ROLE_LABEL[r]}
              </option>
            ))}
          </NativeSelect>
          <Label htmlFor={`role-reason-${u.id}`}>Motivo</Label>
          <Textarea
            id={`role-reason-${u.id}`}
            rows={2}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Label htmlFor={`role-pw-${u.id}`}>Tu contraseña</Label>
          <Input
            id={`role-pw-${u.id}`}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mutation.isError && (
            <ErrorAlert error={mutation.error} title="No se pudo cambiar el rol" />
          )}
        </>
      )}
      <div className="flex gap-2">
        {!mutation.isSuccess && (
          <Button
            size="sm"
            disabled={!ready || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Guardando…' : 'Confirmar cambio de rol'}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onDone}>
          {mutation.isSuccess ? 'Cerrar' : 'Volver'}
        </Button>
      </div>
    </div>
  )
}
