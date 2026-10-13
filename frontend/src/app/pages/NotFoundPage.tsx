import { Link, useLocation } from 'react-router'

import { loginPathFor } from '@/features/auth/nextPath'
import { useMe } from '@/features/auth/session'

/** 404 única: la ruta no existe o el usuario no tiene la capacidad (ADR-0006). */
export function NotFoundPage() {
  const me = useMe()
  const location = useLocation()
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">Página no encontrada</h1>
      <p className="text-muted-foreground">La dirección no existe o no tienes acceso.</p>
      <div className="flex gap-4 text-sm">
        <Link to="/" className="underline underline-offset-4">
          Volver al inicio
        </Link>
        {!me && (
          <Link
            to={loginPathFor(location.pathname + location.search)}
            className="underline underline-offset-4"
          >
            ¿Tienes cuenta? Ingresa
          </Link>
        )}
      </div>
    </section>
  )
}
