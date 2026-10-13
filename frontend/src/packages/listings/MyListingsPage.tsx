import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

/**
 * `/mis-publicaciones` (paquete `listings`, capacidad `listing.manage_own`).
 * El listado necesita un endpoint que el contrato v1 aún no tiene (handoff a backend):
 * mientras tanto solo se crea y se edita por id.
 */
export default function MyListingsPage() {
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Mis publicaciones</h1>
        <Button asChild>
          <Link to="/mis-publicaciones/nueva">Nueva publicación</Link>
        </Button>
      </header>
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Aquí verás el listado de tus artículos. Por ahora puedes crear una publicación y editarla
        desde el enlace que aparece al guardarla.
      </p>
    </section>
  )
}
