import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { isApiError } from '@/api/errors'
import type { UserMe } from '@/api/types'
import { FormErrorBanner } from '@/components/FormErrorBanner'
import { FormField } from '@/components/FormField'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { changePassword, updateProfile } from '@/features/auth/api'
import { PLATFORM_ROLE_LABEL } from '@/features/auth/capabilities'
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN, PASSWORD_MIN } from '@/features/auth/RegisterPage'
import { ME_QUERY_KEY, setSessionUser, useLogout, useMe } from '@/features/auth/session'
import { applyServerFieldErrors } from '@/lib/formErrors'

/** `/cuenta` (capacidad `account.manage_own`): nombre visible, contraseña y cierre de sesión. */
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

      <section className="space-y-3 border-t pt-6">
        <h2 className="text-lg font-medium">Sesión</h2>
        <Button variant="outline" onClick={() => void logout()} disabled={pending}>
          {pending ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </Button>
      </section>
    </div>
  )
}

const profileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(DISPLAY_NAME_MIN, `Entre ${DISPLAY_NAME_MIN} y ${DISPLAY_NAME_MAX} caracteres.`)
    .max(DISPLAY_NAME_MAX, `Entre ${DISPLAY_NAME_MIN} y ${DISPLAY_NAME_MAX} caracteres.`),
})
type ProfileValues = z.infer<typeof profileSchema>

function ProfileForm({ me }: { me: UserMe }) {
  const queryClient = useQueryClient()
  const [extra, setExtra] = useState<string[]>([])
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: { display_name: me.display_name },
  })
  const mutation = useMutation({
    mutationFn: (v: ProfileValues) => updateProfile(v.display_name),
    onSuccess: (updated) => setSessionUser(queryClient, updated),
    onError: (error) => setExtra(applyServerFieldErrors(error, form.setError, ['display_name'])),
  })
  const onSubmit = form.handleSubmit((v) => {
    setExtra([])
    mutation.mutate(v)
  })

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">Perfil</h2>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormErrorBanner error={mutation.error} extraErrors={extra} />
        {mutation.isSuccess && !form.formState.isDirty && (
          <Alert variant="success">Nombre actualizado.</Alert>
        )}
        <FormField label="Nombre visible" error={form.formState.errors.display_name?.message}>
          {(a11y) => <Input autoComplete="nickname" {...a11y} {...form.register('display_name')} />}
        </FormField>
        <Button type="submit" disabled={mutation.isPending || !form.formState.isDirty}>
          {mutation.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </form>
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
