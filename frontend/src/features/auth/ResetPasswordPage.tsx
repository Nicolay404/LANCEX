import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'

import { FormErrorBanner } from '@/components/FormErrorBanner'
import { FormField } from '@/components/FormField'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { applyServerFieldErrors } from '@/lib/formErrors'

import { confirmPasswordReset } from './api'
import { AuthCard } from './AuthCard'
import { PASSWORD_MIN } from './RegisterPage'

const schema = z
  .object({
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
type Values = z.infer<typeof schema>

/**
 * `/restablecer-contrasena?token=...` (pública): enlace de un solo uso que generó un admin.
 * El token se lee una vez y se quita de la barra de direcciones (historial, capturas, Referer).
 */
export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [token] = useState(() => params.get('token') ?? '')
  const [extra, setExtra] = useState<string[]>([])

  useEffect(() => {
    if (params.has('token')) void navigate('/restablecer-contrasena', { replace: true })
  }, [params, navigate])

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { new_password: '', new_password_confirm: '' },
  })
  const mutation = useMutation({
    mutationFn: (v: Values) => confirmPasswordReset(token, v.new_password),
    onError: (error) => {
      form.reset()
      // `token` no es un campo del formulario: su mensaje ("no es válido o ya expiró") va arriba.
      setExtra(applyServerFieldErrors(error, form.setError, ['new_password']))
    },
  })
  const onSubmit = form.handleSubmit((v) => {
    setExtra([])
    mutation.mutate(v)
  })
  const { errors } = form.formState

  if (!token) {
    return (
      <AuthCard title="Restablecer contraseña">
        <Alert variant="destructive">
          Este enlace no es válido. Pide a un administrador uno nuevo.
        </Alert>
      </AuthCard>
    )
  }

  if (mutation.isSuccess) {
    return (
      <AuthCard title="Contraseña actualizada">
        <Alert variant="success">
          Listo. Se cerraron tus sesiones abiertas. Ingresa con tu nueva contraseña.
        </Alert>
        <Button asChild className="w-full">
          <Link to="/ingresar">Ir a ingresar</Link>
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Restablecer contraseña"
      subtitle="Elige una contraseña nueva. El enlace sirve una sola vez y vence a los 30 minutos."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormErrorBanner error={mutation.error} extraErrors={extra} />
        <FormField
          label="Nueva contraseña"
          error={errors.new_password?.message}
          hint={`Mínimo ${PASSWORD_MIN} caracteres; evita contraseñas comunes.`}
        >
          {(a11y) => (
            <Input
              type="password"
              autoComplete="new-password"
              autoFocus
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
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? 'Guardando…' : 'Guardar contraseña'}
        </Button>
      </form>
    </AuthCard>
  )
}
