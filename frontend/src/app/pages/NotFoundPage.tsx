import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">Página no encontrada</h1>
      <p className="text-muted-foreground">La dirección no existe o no tienes acceso.</p>
      <Link to="/" className="text-sm underline underline-offset-4">
        Volver al inicio
      </Link>
    </section>
  )
}
