import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'

import { isApiError } from '@/api/errors'
import type { UserMe } from '@/api/types'
import { ErrorAlert } from '@/components/ErrorAlert'
import { FormErrorBanner } from '@/components/FormErrorBanner'
import { FormField } from '@/components/FormField'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PageLoading } from '@/components/PageLoading'
import { changePassword, updateProfile, type ProfileInput } from '@/features/auth/api'
import { PLATFORM_ROLE_LABEL } from '@/features/auth/capabilities'
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN, PASSWORD_MIN } from '@/features/auth/RegisterPage'
import { ME_QUERY_KEY, setSessionUser, useLogout, useMe } from '@/features/auth/session'
import { fetchActivity, fetchSessions, meKeys, revokeOtherSessions } from '@/features/me/api'
import { ACTIVITY_LABEL } from '@/features/me/types'
import { formatDateTime } from '@/lib/dates'
import { applyServerFieldErrors } from '@/lib/formErrors'
import { formatMoney } from '@/lib/money'

/** `/cuenta` (capacidad `account.manage_own`): perfil, contraseña, sesiones y actividad. */
export default function AccountPage() {
  const me = useMe()
  const { logout, pending } = useLogout()
  if (!me) return null

  return (
    <div className="max-w-xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
        <p className="text-sm text-muted-foreground">
          {me.email} · {PLATFORM_ROLE_LABEL[me.platform_role] ?? me.platform_role}
        </p>
      </header>

      <ProfileForm me={me} />
      <PasswordForm />
      <SessionsSection />
      <ActivitySection />

      <section className="space-y-3 border-t pt-6">
        <h2 className="text-lg font-medium">Sesión</h2>
        <Button variant="outline" onClick={() => void logout()} disabled={pending}>
          {pending ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </Button>
      </section>
    </div>
  )
}

const BIO_MAX = 300
const CITY_MAX = 80

const profileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(DISPLAY_NAME_MIN, `Entre ${DISPLAY_NAME_MIN} y ${DISPLAY_NAME_MAX} caracteres.`)
    .max(DISPLAY_NAME_MAX, `Entre ${DISPLAY_NAME_MIN} y ${DISPLAY_NAME_MAX} caracteres.`),
  bio: z.string().trim().max(BIO_MAX, `Máximo ${BIO_MAX} caracteres.`),
  location_city: z
    .string()
    .trim()
    .refine((v) => v === '' || (v.length >= 2 && v.length <= CITY_MAX), 'Entre 2 y 80 caracteres.'),
})
type ProfileValues = z.infer<typeof profileSchema>
const PROFILE_FIELDS = ['display_name', 'bio', 'location_city'] as const

function ProfileForm({ me }: { me: UserMe }) {
  const queryClient = useQueryClient()
  const [extra, setExtra] = useState<string[]>([])
  const initial: ProfileValues = {
    display_name: me.display_name,
    bio: me.bio ?? '',
    location_city: me.location_city ?? '',
  }
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: initial,
  })
  const mutation = useMutation({
    mutationFn: (changes: ProfileInput) => updateProfile(changes),
    onSuccess: (updated) => setSessionUser(queryClient, updated),
    onError: (error) => setExtra(applyServerFieldErrors(error, form.setError, PROFILE_FIELDS)),
  })
  const onSubmit = form.handleSubmit((v) => {
    setExtra([])
    // PATCH parcial: solo lo que cambió; vacío = borrar (null).
    const changes: ProfileInput = {}
    if (v.display_name !== initial.display_name) changes.display_name = v.display_name
    if (v.bio !== initial.bio) changes.bio = v.bio || null
    if (v.location_city !== initial.location_city) changes.location_city = v.location_city || null
    if (Object.keys(changes).length > 0) mutation.mutate(changes)
  })
  const { errors } = form.formState

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">Perfil</h2>
      <p className="text-sm text-muted-foreground">
        Tu nombre, presentación y ciudad son públicos en{' '}
        <Link to={`/usuarios/${me.id}`} className="underline underline-offset-2">
          tu perfil
        </Link>
        . Tu email nunca se muestra.
      </p>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormErrorBanner error={mutation.error} extraErrors={extra} />
        {mutation.isSuccess && !form.formState.isDirty && (
          <Alert variant="success">Perfil actualizado.</Alert>
        )}
        <FormField label="Nombre visible" error={errors.display_name?.message}>
          {(a11y) => <Input autoComplete="nickname" {...a11y} {...form.register('display_name')} />}
        </FormField>
        <FormField
          label="Presentación"
          error={errors.bio?.message}
          hint={`Opcional, hasta ${BIO_MAX} caracteres. Sin enlaces ni direcciones web.`}
        >
          {(a11y) => <Textarea rows={3} maxLength={BIO_MAX} {...a11y} {...form.register('bio')} />}
        </FormField>
        <FormField label="Ciudad" error={errors.location_city?.message} hint="Opcional.">
          {(a11y) => (
            <Input
              autoComplete="address-level2"
              maxLength={CITY_MAX}
              {...a11y}
              {...form.register('location_city')}
            />
          )}
        </FormField>
        <Button type="submit" disabled={mutation.isPending || !form.formState.isDirty}>
          {mutation.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </form>
    </section>
  )
}

/** Sesiones activas (sin claves) y "cerrar las demás" (T12). */
function SessionsSection() {
  const queryClient = useQueryClient()
  const sessions = useQuery({
    queryKey: meKeys.sessions,
    queryFn: ({ signal }) => fetchSessions(signal),
  })
  const revoke = useMutation({
    mutationFn: revokeOtherSessions,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: meKeys.sessions }),
  })
  const others = sessions.data?.results.filter((x) => !x.is_current).length ?? 0

  return (
    <section className="space-y-3 border-t pt-6">
      <h2 className="text-lg font-medium">Sesiones activas</h2>
      {sessions.isPending ? (
        <PageLoading />
      ) : sessions.isError ? (
        <ErrorAlert error={sessions.error} />
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {sessions.data.results.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span>{x.is_current ? <strong>Este dispositivo</strong> : 'Otro dispositivo'}</span>
              <span className="text-xs text-muted-foreground">
                vence {formatDateTime(x.expires_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {revoke.isSuccess && (
        <Alert variant="success">
          {revoke.data.revoked === 1
            ? 'Se cerró 1 sesión en otro dispositivo.'
            : `Se cerraron ${revoke.data.revoked} sesiones en otros dispositivos.`}
        </Alert>
      )}
      {revoke.isError && <ErrorAlert error={revoke.error} />}
      <Button
        variant="outline"
        disabled={revoke.isPending || others === 0}
        onClick={() => revoke.mutate()}
      >
        {revoke.isPending ? 'Cerrando…' : 'Cerrar sesión en los demás dispositivos'}
      </Button>
    </section>
  )
}

/** Registro de mis acciones (`GET /me/activity/`): solo datos propios y de lista blanca. */
function ActivitySection() {
  const [page, setPage] = useState(1)
  const activity = useQuery({
    queryKey: meKeys.activity(page),
    queryFn: ({ signal }) => fetchActivity(page, signal),
    placeholderData: keepPreviousData,
  })
  return (
    <section className="space-y-3 border-t pt-6">
      <h2 className="text-lg font-medium">Mi actividad reciente</h2>
      {activity.isPending ? (
        <PageLoading />
      ) : activity.isError ? (
        <ErrorAlert error={activity.error} />
      ) : activity.data.results.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin actividad todavía.</p>
      ) : (
        <>
          <ul className="divide-y rounded-lg border text-sm">
            {activity.data.results.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2"
              >
                <span>
                  {ACTIVITY_LABEL[e.action] ?? 'Acción registrada'}
                  {e.action === 'bid_accepted' && typeof e.details['amount'] === 'string' && (
                    <> por {formatMoney(e.details['amount'])}</>
                  )}
                  {e.auction_id && (
                    <>
                      {' en '}
                      <Link
                        to={`/subastas/${e.auction_id}`}
                        className="underline underline-offset-2"
                      >
                        {e.auction_title ?? 'una subasta'}
                      </Link>
                    </>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(e.occurred_at)}
                </span>
              </li>
            ))}
          </ul>
          {(activity.data.previous || activity.data.next) && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!activity.data.previous}
                onClick={() => setPage(page - 1)}
              >
                Más recientes
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!activity.data.next}
                onClick={() => setPage(page + 1)}
              >
                Anteriores
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'Ingresa tu contraseña actual.'),
    new_password: z
      .string()
      .min(PASSWORD_MIN, `Mínimo ${PASSWORD_MIN} caracteres.`)
      .max(128, 'Máximo 128 caracteres.'),
    new_password_confirm: z.string(),
  })
  .refine((v) => v.new_password === v.new_password_confirm, {
    path: ['new_password_confirm'],
    message: 'Las contraseñas no coinciden.',
  })
type PasswordValues = z.infer<typeof passwordSchema>

function PasswordForm() {
  const queryClient = useQueryClient()
  const [extra, setExtra] = useState<string[]>([])
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: '', new_password: '', new_password_confirm: '' },
  })
  const mutation = useMutation({
    mutationFn: ({ current_password, new_password }: PasswordValues) =>
      changePassword({ current_password, new_password }),
    onSuccess: () => {
      form.reset()
      // El backend rota la sesión y cierra las demás: refrescamos /auth/me.
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: meKeys.sessions })
    },
    onError: (error) => {
      form.resetField('current_password')
      if (isApiError(error) && error.code === 'STEP_UP_FAILED') {
        form.setError('current_password', { type: 'server', message: error.message })
        return
      }
      setExtra(applyServerFieldErrors(error, form.setError, ['current_password', 'new_password']))
    },
  })
  const onSubmit = form.handleSubmit((v) => {
    setExtra([])
    mutation.mutate(v)
  })
  const { errors } = form.formState
  const stepUp = isApiError(mutation.error) && mutation.error.code === 'STEP_UP_FAILED'

  return (
    <section className="space-y-3 border-t pt-6">
      <h2 className="text-lg font-medium">Cambiar contraseña</h2>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {!stepUp && <FormErrorBanner error={mutation.error} extraErrors={extra} />}
        {mutation.isSuccess && (
          <Alert variant="success">
            Contraseña actualizada. Se cerraron tus sesiones en otros dispositivos.
          </Alert>
        )}
        <FormField label="Contraseña actual" error={errors.current_password?.message}>
          {(a11y) => (
            <Input
              type="password"
              autoComplete="current-password"
              {...a11y}
              {...form.register('current_password')}
            />
          )}
        </FormField>
        <FormField
          label="Nueva contraseña"
          error={errors.new_password?.message}
          hint={`Mínimo ${PASSWORD_MIN} caracteres; evita contraseñas comunes.`}
        >
          {(a11y) => (
            <Input
              type="password"
              autoComplete="new-password"
              {...a11y}
              {...form.register('new_password')}
            />
          )}
        </FormField>
        <FormField label="Repite la nueva contraseña" error={errors.new_password_confirm?.message}>
          {(a11y) => (
            <Input
              type="password"
              autoComplete="new-password"
              {...a11y}
              {...form.register('new_password_confirm')}
            />
          )}
        </FormField>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Actualizando…' : 'Cambiar contraseña'}
        </Button>
      </form>
    </section>
  )
}
