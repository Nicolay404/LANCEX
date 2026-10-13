import { QueryClient } from '@tanstack/react-query'

import { isApiError } from '@/api/errors'

/** Errores que no tiene sentido reintentar automáticamente. */
const NO_RETRY_STATUS = new Set([400, 401, 403, 404, 405, 406, 409, 415, 429])

export function createQueryClient(): QueryClient {
  return new QueryClient({
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
}
