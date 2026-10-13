import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'

import { FormErrorBanner } from '@/components/FormErrorBanner'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { applyServerFieldErrors } from '@/lib/formErrors'

import { login } from './api'
import { AuthCard } from './AuthCard'
import { setSessionUser } from './session'

// Sin reglas de fortaleza aquí: el login responde siempre con un mensaje genérico.
const schema = z.object({
  email: z.string().trim().min(1, 'Ingresa tu email.').max(254),
  password: z.string().min(1, 'Ingresa tu contraseña.').max(128),
})
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const queryClient = useQueryClient()
  const [extraErrors, setExtraErrors] = useState<string[]>([])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const mutation = useMutation({
    mutationFn: login,
    // GuestOnly redirige a ?next (validado) en cuanto la sesión existe.
    onSuccess: (me) => setSessionUser(queryClient, me),
    onError: (error) => {
      form.resetField('password')
      setExtraErrors(applyServerFieldErrors(error, form.setError, ['email', 'password']))
    },
  })

  const onSubmit = form.handleSubmit((values) => {
    setExtraErrors([])
    mutation.mutate(values)
  })
  const { errors } = form.formState

  return (
    <AuthCard
      title="Ingresar"
      footer={
        <>
          ¿No tienes cuenta?{' '}
          <Link to="/registro" className="font-medium text-foreground underline underline-offset-4">
            Crear cuenta
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormErrorBanner error={mutation.error} extraErrors={extraErrors} />

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

        <FormField label="Contraseña" error={errors.password?.message}>
          {(a11y) => (
            <Input
              type="password"
              autoComplete="current-password"
              {...a11y}
              {...form.register('password')}
            />
          )}
        </FormField>

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
    </AuthCard>
  )
}
