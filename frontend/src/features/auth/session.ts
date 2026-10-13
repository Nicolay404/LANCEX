import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { UserMe } from '@/api/types'

import { fetchMe, logoutRequest } from './api'
import { ME_QUERY_KEY } from './keys'

export { ME_QUERY_KEY }

/** Sesión actual. `data === null` = visitante. Única fuente para menús y rutas (ADR-0006). */
export function useSession() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: ({ signal }) => fetchMe(signal),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: true,
  })
}

/** Usuario actual ya cargado (o `null`). Usar solo debajo de `AppShell`, que espera la carga. */
export function useMe(): UserMe | null {
  const { data } = useSession()
  return data ?? null
}

export function setSessionUser(queryClient: QueryClient, me: UserMe | null): void {
  queryClient.setQueryData(ME_QUERY_KEY, me)
}

export type Reload = () => void

const fullReload: Reload = () => window.location.assign('/')

/**
 * Logout (ADR-0006): borra la sesión en el servidor, vacía TODA la caché del cliente y
 * recarga la página completa para descartar los paquetes de código del rol anterior.
 */
export async function logout(queryClient: QueryClient, reload: Reload = fullReload): Promise<void> {
  try {
    await logoutRequest()
  } catch {
    // Si la sesión ya había expirado, igual limpiamos y recargamos.
  } finally {
    queryClient.clear()
    reload()
  }
}

export function useLogout(reload?: Reload) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)
  const run = async () => {
    setPending(true)
    await logout(queryClient, reload)
  }
  return { logout: run, pending }
}
