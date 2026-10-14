import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { isApiError } from '@/api/errors'
import { ErrorAlert } from '@/components/ErrorAlert'
import { FormField } from '@/components/FormField'
import { PageLoading } from '@/components/PageLoading'
import { QrCode } from '@/components/QrCode'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  disableMfa,
  enableMfa,
  fetchMfaStatus,
  regenerateRecoveryCodes,
  startMfaSetup,
  type MfaSetup,
} from '@/features/auth/api'
import { meKeys } from '@/features/me/api'
import { formatDateTime } from '@/lib/dates'

/**
 * Verificación en dos pasos (TOTP). El secreto y los códigos de respaldo solo viven en el estado
 * de este componente: nunca en localStorage, la URL ni la caché de consultas.
 */
export function MfaSection() {
  const status = useQuery({ queryKey: meKeys.mfa, queryFn: ({ signal }) => fetchMfaStatus(signal) })
  const [codes, setCodes] = useState<string[] | null>(null)

  return (
    <section className="space-y-3 border-t pt-6">
      <h2 className="text-lg font-medium">Verificación en dos pasos</h2>
      <p className="text-sm text-muted-foreground">
        Además de tu contraseña, al ingresar te pediremos un código de una app de autenticación
        (Google Authenticator, Microsoft Authenticator, Authy…).
      </p>
      {codes ? (
        <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />
      ) : status.isPending ? (
        <PageLoading />
      ) : status.isError ? (
        <ErrorAlert error={status.error} />
      ) : status.data.enabled ? (
        <EnabledPanel
          enabledAt={status.data.enabled_at}
          remaining={status.data.recovery_codes_remaining}
          onNewCodes={setCodes}
        />
      ) : (
        <SetupFlow onEnabled={setCodes} />
      )}
    </section>
  )
}

function SetupFlow({ onEnabled }: { onEnabled: (codes: string[]) => void }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [setup, setSetup] = useState<MfaSetup | null>(null)
  const [code, setCode] = useState('')

  const start = useMutation({
    mutationFn: () => startMfaSetup(password),
    onSuccess: (data) => setSetup(data),
    onSettled: () => setPassword(''),
  })
  const enable = useMutation({
    mutationFn: () => enableMfa(code),
    onSuccess: (data) => {
      setSetup(null)
      void queryClient.invalidateQueries({ queryKey: meKeys.mfa })
      void queryClient.invalidateQueries({ queryKey: meKeys.sessions })
      onEnabled(data.recovery_codes)
    },
    onError: () => setCode(''),
  })

  if (!open) {
    return (
      <div className="space-y-2">
        <p className="text-sm">
          Estado: <strong>desactivada</strong>
        </p>
        <Button onClick={() => setOpen(true)}>Activar verificación en dos pasos</Button>
      </div>
    )
  }

  if (!setup) {
    const submit = (e: FormEvent) => {
      e.preventDefault()
      if (password) start.mutate()
    }
    return (
      <form onSubmit={submit} noValidate className="max-w-sm space-y-3">
        {start.isError && <ErrorAlert error={start.error} />}
        <FormField label="Confirma tu contraseña">
          {(a11y) => (
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              {...a11y}
            />
          )}
        </FormField>
        <div className="flex gap-2">
          <Button type="submit" disabled={!password || start.isPending}>
            {start.isPending ? 'Preparando…' : 'Continuar'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    )
  }

  const submitCode = (e: FormEvent) => {
    e.preventDefault()
    if (/^\d{6}$/.test(code)) enable.mutate()
  }
  return (
    <div className="space-y-4">
      <ol className="list-inside list-decimal space-y-1 text-sm">
        <li>Abre tu app de autenticación y agrega una cuenta nueva.</li>
        <li>Escanea este código QR (o escribe la clave a mano).</li>
        <li>Escribe el código de 6 dígitos que muestra la app.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-6">
        <QrCode value={setup.otpauth_uri} label="Código QR para tu app de autenticación" />
        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">Clave para escribir a mano:</p>
          <code className="block rounded bg-muted px-2 py-1 font-mono tracking-wider break-all">
            {setup.secret.match(/.{1,4}/g)?.join(' ')}
          </code>
        </div>
      </div>
      <form onSubmit={submitCode} noValidate className="max-w-sm space-y-3">
        {enable.isError && <ErrorAlert error={enable.error} />}
        <FormField label="Código de la app">
          {(a11y) => (
            <Input
              autoComplete="one-time-code"
              inputMode="numeric"
              placeholder="123456"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              {...a11y}
            />
          )}
        </FormField>
        <div className="flex gap-2">
          <Button type="submit" disabled={!/^\d{6}$/.test(code) || enable.isPending}>
            {enable.isPending ? 'Activando…' : 'Activar'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSetup(null)
              setOpen(false)
            }}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  )
}

/** Se muestran UNA vez: el backend solo guarda su hash. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  const text = codes.join('\n')
  const download = () => {
    const url = URL.createObjectURL(new Blob([`Códigos de respaldo de LANCEX\n\n${text}\n`]))
    const a = document.createElement('a')
    a.href = url
    a.download = 'lancex-codigos-de-respaldo.txt'
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="space-y-3">
      <Alert variant="success">
        Guarda estos códigos de respaldo en un lugar seguro. Cada uno sirve una sola vez para
        ingresar si no tienes tu teléfono. <strong>No los volverás a ver.</strong>
      </Alert>
      <ul
        aria-label="Códigos de respaldo"
        className="grid grid-cols-2 gap-2 rounded-lg border p-3 font-mono text-sm"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() =>
            void navigator.clipboard?.writeText(text).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          {copied ? 'Copiados' : 'Copiar'}
        </Button>
        <Button variant="outline" onClick={download}>
          Descargar .txt
        </Button>
        <Button onClick={onDone}>Ya los guardé</Button>
      </div>
    </div>
  )
}

function EnabledPanel({
  enabledAt,
  remaining,
  onNewCodes,
}: {
  enabledAt: string | null
  remaining: number
  onNewCodes: (codes: string[]) => void
}) {
  const [mode, setMode] = useState<'idle' | 'regenerate' | 'disable'>('idle')
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Estado: <strong className="text-emerald-300">activada</strong>
        {enabledAt && <> desde {formatDateTime(enabledAt)}</>}.
      </p>
      <p className="text-sm text-muted-foreground">
        Te quedan {remaining} {remaining === 1 ? 'código' : 'códigos'} de respaldo.
      </p>
      {remaining <= 3 && mode === 'idle' && (
        <Alert>Te quedan pocos códigos de respaldo: genera unos nuevos.</Alert>
      )}
      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setMode('regenerate')}>
            Generar nuevos códigos de respaldo
          </Button>
          <Button variant="outline" onClick={() => setMode('disable')}>
            Desactivar
          </Button>
        </div>
      ) : (
        <StepUpForm
          action={mode}
          onCancel={() => setMode('idle')}
          onCodes={(codes) => {
            setMode('idle')
            onNewCodes(codes)
          }}
        />
      )}
    </div>
  )
}

/** Contraseña + código (de la app o de respaldo) para desactivar o regenerar. */
function StepUpForm({
  action,
  onCancel,
  onCodes,
}: {
  action: 'regenerate' | 'disable'
  onCancel: () => void
  onCodes: (codes: string[]) => void
}) {
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const mutation = useMutation({
    mutationFn: async () => {
      if (action === 'disable') {
        await disableMfa(password, code.trim())
        return null
      }
      return (await regenerateRecoveryCodes(password, code.trim())).recovery_codes
    },
    onSuccess: (codes) => {
      void queryClient.invalidateQueries({ queryKey: meKeys.mfa })
      if (codes) onCodes(codes)
      else onCancel()
    },
    onSettled: () => {
      setPassword('')
      setCode('')
    },
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (password && code.trim()) mutation.mutate()
  }
  const stepUp = isApiError(mutation.error) && mutation.error.code === 'STEP_UP_FAILED'
  return (
    <form onSubmit={submit} noValidate className="max-w-sm space-y-3">
      {mutation.isError && (
        <ErrorAlert
          error={mutation.error}
          title={stepUp ? 'La contraseña o el código no son correctos' : undefined}
        />
      )}
      <FormField label="Tu contraseña">
        {(a11y) => (
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            {...a11y}
          />
        )}
      </FormField>
      <FormField label="Código de la app o de respaldo">
        {(a11y) => (
          <Input
            autoComplete="one-time-code"
            maxLength={32}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            {...a11y}
          />
        )}
      </FormField>
      <div className="flex gap-2">
        <Button
          type="submit"
          variant={action === 'disable' ? 'destructive' : 'default'}
          disabled={!password || !code.trim() || mutation.isPending}
        >
          {action === 'disable' ? 'Desactivar verificación' : 'Generar códigos'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
