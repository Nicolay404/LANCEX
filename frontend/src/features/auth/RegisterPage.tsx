import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'

import { isApiError } from '@/api/errors'
import { FormErrorBanner } from '@/components/FormErrorBanner'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { applyServerFieldErrors } from '@/lib/formErrors'

import { register as registerRequest } from './api'
import { AuthCard } from './AuthCard'
import { setSessionUser } from './session'

// Reglas que el backend también valida (accounts/services/validation.py): esto es solo UX.
export const DISPLAY_NAME_MIN = 3
export const DISPLAY_NAME_MAX = 60
export const PASSWORD_MIN = 10

const schema = z
  .object({
    email: z.email('Ingresa un email válido.').max(254),
    display_name: z
      .string()
      .trim()
      .min(DISPLAY_NAME_MIN, `Entre ${DISPLAY_NAME_MIN} y ${DISPLAY_NAME_MAX} caracteres.`)
      .max(DISPLAY_NAME_MAX, `Entre ${DISPLAY_NAME_MIN} y ${DISPLAY_NAME_MAX} caracteres.`),
    password: z
      .string()
      .min(PASSWORD_MIN, `Mínimo ${PASSWORD_MIN} caracteres.`)
      .max(128, 'Máximo 128 caracteres.'),
    password_confirm: z.string(),
  })
  .refine((v) => v.password === v.password_confirm, {
    path: ['password_confirm'],
    message: 'Las contraseñas no coinciden.',
  })
type FormValues = z.infer<typeof schema>

export function RegisterPage() {
  const queryClient = useQueryClient()
  const [extraErrors, setExtraErrors] = useState<string[]>([])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', display_name: '', password: '', password_confirm: '' },
  })

  const mutation = useMutation({
    mutationFn: registerRequest,
    // GuestOnly redirige a ?next (validado) en cuanto la sesión existe.
    onSuccess: (me) => setSessionUser(queryClient, me),
    onError: (error) => {
      if (isApiError(error) && error.code === 'EMAIL_ALREADY_REGISTERED') {
        form.setError('email', { type: 'server', message: error.message })
        return
      }
      setExtraErrors(
        applyServerFieldErrors(error, form.setError, ['email', 'display_name', 'password']),
      )
    },
  })

  // `password_confirm` nunca se envía: el backend rechaza campos desconocidos (UNKNOWN_FIELD).
  const onSubmit = form.handleSubmit(({ email, display_name, password }) => {
    setExtraErrors([])
    mutation.mutate({ email, display_name, password })
  })
  const { errors } = form.formState
  const emailTaken =
    isApiError(mutation.error) && mutation.error.code === 'EMAIL_ALREADY_REGISTERED'

  return (
    <AuthCard
      title="Crear cuenta"
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to="/ingresar" className="font-medium text-foreground underline underline-offset-4">
            Ingresar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {!emailTaken && <FormErrorBanner error={mutation.error} extraErrors={extraErrors} />}

        <FormField label="Email" error={errors.email?.message}>
          {(a11y) => (
            <Input
              type="email"
              autoComplete="email"
              autoFocus
              {...a11y}
              {...form.register('email')}
            />
          )}
        </FormField>

        <FormField
          label="Nombre visible"
          error={errors.display_name?.message}
          hint="Es lo que verán otros usuarios. No pongas tu email ni enlaces."
        >
          {(a11y) => <Input autoComplete="nickname" {...a11y} {...form.register('display_name')} />}
        </FormField>

        <FormField
          label="Contraseña"
          error={errors.password?.message}
          hint={`Mínimo ${PASSWORD_MIN} caracteres; evita contraseñas comunes.`}
        >
          {(a11y) => (
            <Input
              type="password"
              autoComplete="new-password"
              {...a11y}
              {...form.register('password')}
            />
          )}
        </FormField>

        <FormField label="Repite la contraseña" error={errors.password_confirm?.message}>
          {(a11y) => (
            <Input
              type="password"
              autoComplete="new-password"
              {...a11y}
              {...form.register('password_confirm')}
            />
          )}
        </FormField>

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
      </form>
    </AuthCard>
  )
}
