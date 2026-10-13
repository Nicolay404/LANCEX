import type { UserOrganization } from '@/api/types'

/** Paquete `org-buyer`: necesidades, subastas inversas y calificación de proveedores (LX-53). */
export default function BuyerSection({ org }: { org: UserOrganization }) {
  return (
    <section className="space-y-2 rounded-lg border p-4">
      <h2 className="font-medium">Compras de {org.legal_name}</h2>
      <p className="text-sm text-muted-foreground">
        Necesidades y subastas inversas: en construcción (LX-53).
      </p>
    </section>
  )
}
