import type { ReactNode } from 'react'
import { Navigate, useSearchParams } from 'react-router'

import { safeNextPath } from './nextPath'
import { useMe } from './session'

/**
 * Pantallas solo para visitantes (/ingresar, /registro). En cuanto hay sesión —también justo
 * después de un login correcto— se va a `?next` validado o al inicio.
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const me = useMe()
  const [params] = useSearchParams()
  if (me) return <Navigate to={safeNextPath(params.get('next'))} replace />
  return children
}
