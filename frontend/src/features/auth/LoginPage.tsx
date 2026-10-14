import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'

import { isApiError } from '@/api/errors'
import { FormErrorBanner } from '@/components/FormErrorBanner'
import { FormField } from '@/components/FormField'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { applyServerFieldErrors } from '@/lib/formErrors'

import { isMfaRequired, login, loginMfa } from './api'
import { AuthCard } from './AuthCard'
import { setSessionUser } from './session'

// Sin reglas de fortaleza aquí: el login responde siempre con un mensaje genérico.
const schema = z.object({
  email: z.string().trim().min(1, 'Ingresa tu email.').max(254),
  password: z.string().min(1, 'Ingresa tu contraseña.').max(128),
})
type FormValues = z.infer<typeof schema>

/**
 * `/ingresar`. Con doble factor el backend responde `{mfa_required: true}` sin iniciar sesión y
 * pasamos al segundo paso (`MfaStep`). La contraseña nunca se guarda entre pasos.
 */
export function LoginPage() {
  const queryClient = useQueryClient()
  const [extraErrors, setExtraErrors] = useState<string[]>([])
  const [step, setStep] = useState<'password' | 'mfa'>('password')
  const [expired, setExpired] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const mutation = useMutation({
    mutationFn: login,
    // GuestOnly redirige a ?next (validado) en cuanto la sesión existe.
    onSuccess: (result) => {
      form.resetField('password')
      if (isMfaRequired(result)) setStep('mfa')
      else setSessionUser(queryClient, result)
    },
    onError: (error) => {
      form.resetField('password')
      setExtraErrors(applyServerFieldErrors(error, form.setError, ['email', 'password']))
    },
  })

  const onSubmit = form.handleSubmit((values) => {
    setExtraErrors([])
    setExpired(false)
    mutation.mutate(values)
  })
  const { errors } = form.formState

  if (step === 'mfa') {
    return (
      <MfaStep
        onExpired={() => {
          mutation.reset()
          setExpired(true)
          setStep('password')
        }}
      />
    )
  }

  return (
    <AuthCard
      title="Ingresar"
      footer={
        <div className="space-y-2">
          <p>
            ¿No tienes cuenta?{' '}
            <Link
              to="/registro"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Crear cuenta
            </Link>
          </p>
          <p className="text-xs">
            ¿Olvidaste tu contraseña? Pide a un administrador un enlace de restablecimiento.
          </p>
        </div>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {expired && (
          <Alert>Pasó el tiempo para ingresar el código. Vuelve a ingresar tu contraseña.</Alert>
        )}
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

/** Segundo paso: código de la app (6 dígitos) o, si no hay teléfono, un código de respaldo. */
function MfaStep({ onExpired }: { onExpired: () => void }) {
  const queryClient = useQueryClient()
  const [useRecovery, setUseRecovery] = useState(false)
  const [code, setCode] = useState('')
  const mutation = useMutation({
    mutationFn: () => loginMfa(code.trim()),
    onSuccess: (me) => setSessionUser(queryClient, me),
    onError: (error) => {
      setCode('')
      if (isApiError(error) && error.code === 'MFA_SESSION_EXPIRED') onExpired()
    },
  })
  const ready = useRecovery ? code.replace(/[\s-]/g, '').length >= 16 : /^\d{6}$/.test(code.trim())

  return (
    <AuthCard
      title="Verificación en dos pasos"
      subtitle={
        useRecovery
          ? 'Escribe uno de tus códigos de respaldo. Cada código sirve una sola vez.'
          : 'Abre tu app de autenticación y escribe el código de 6 dígitos de LANCEX.'
      }
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (ready) mutation.mutate()
        }}
      >
        {mutation.isError && <FormErrorBanner error={mutation.error} />}
        <FormField label={useRecovery ? 'Código de respaldo' : 'Código de verificación'}>
          {(a11y) =>
            useRecovery ? (
              <Input
                autoComplete="off"
                autoFocus
                placeholder="XXXX-XXXX-XXXX-XXXX"
                maxLength={32}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                {...a11y}
              />
            ) : (
              <Input
                autoComplete="one-time-code"
                inputMode="numeric"
                autoFocus
                placeholder="123456"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                {...a11y}
              />
            )
          }
        </FormField>
        <Button type="submit" className="w-full" disabled={!ready || mutation.isPending}>
          {mutation.isPending ? 'Verificando…' : 'Verificar'}
        </Button>
        <Button
          type="button"
          variant="link"
          className="w-full"
          onClick={() => {
            setUseRecovery(!useRecovery)
            setCode('')
            mutation.reset()
          }}
        >
          {useRecovery
            ? 'Usar el código de la app'
            : 'No tengo mi teléfono: usar un código de respaldo'}
        </Button>
      </form>
    </AuthCard>
  )
}
