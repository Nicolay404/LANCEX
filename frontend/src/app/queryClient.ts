import { MutationCache, QueryCache, QueryClient, type QueryKey } from '@tanstack/react-query'

import { isApiError } from '@/api/errors'
import { ME_QUERY_KEY } from '@/features/auth/keys'

/** Errores que no tiene sentido reintentar automáticamente. */
const NO_RETRY_STATUS = new Set([400, 401, 403, 404, 405, 406, 409, 415, 429])

const isMeKey = (key: QueryKey | undefined) =>
  !!key && key.length === ME_QUERY_KEY.length && key.every((k, i) => k === ME_QUERY_KEY[i])

/**
 * Reacción global a errores de autorización (frontend/README.md):
 * - `401 AUTH_REQUIRED`: la sesión expiró o fue revocada → pasamos a visitante.
 * - `403 FORBIDDEN`: las capacidades pudieron cambiar (p. ej. suspensión) → se vuelve a pedir `/auth/me`.
 */
function handleAuthError(client: QueryClient, error: unknown, key?: QueryKey): void {
  if (!isApiError(error) || isMeKey(key)) return
  if (error.status === 401 && error.code === 'AUTH_REQUIRED') {
    client.setQueryData(ME_QUERY_KEY, null)
  } else if (error.status === 403 && error.code === 'FORBIDDEN') {
    void client.invalidateQueries({ queryKey: ME_QUERY_KEY })
  }
}

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => handleAuthError(client, error, query.queryKey),
    }),
    mutationCache: new MutationCache({
      onError: (error) => handleAuthError(client, error),
    }),
    defaultOptions: {
      queries: {
        // ADR-0004 §4: sin polling en pestañas ocultas.
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        staleTime: 5_000,
        retry: (failureCount, error) =>
          !(isApiError(error) && NO_RETRY_STATUS.has(error.status)) && failureCount < 2,
      },
      mutations: {
        // Las mutaciones no se reintentan solas: las pujas reintentan a mano con la misma Idempotency-Key.
        retry: false,
      },
    },
  })
  return client
}
