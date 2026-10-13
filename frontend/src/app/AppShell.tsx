import { useMemo } from 'react'
import { useRoutes } from 'react-router'

import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Button } from '@/components/ui/button'
import { useSession } from '@/features/auth/session'

import { buildRoutes } from './buildRoutes'

/**
 * Raíz de la interfaz: espera `GET /auth/me` y registra solo las rutas que permiten sus
 * `capabilities`. Si cambian (login, logout, cambio de rol), el árbol de rutas se recalcula.
 */
export function AppShell() {
  const session = useSession()
  const me = session.data ?? null
  const routes = useMemo(() => buildRoutes(me), [me])
  const element = useRoutes(routes)

  if (session.isPending) return <PageLoading label="Cargando LANCEX…" />

  if (session.isError) {
    return (
      <main className="mx-auto max-w-md space-y-4 px-4 py-16">
        <ErrorAlert error={session.error} title="No se pudo cargar tu sesión" />
        <Button onClick={() => void session.refetch()}>Reintentar</Button>
      </main>
    )
  }

  return element
}
