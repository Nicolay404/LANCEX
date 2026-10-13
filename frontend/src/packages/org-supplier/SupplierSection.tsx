import type { UserOrganization } from '@/api/types'

/** Paquete `org-supplier`: oportunidades, inscripciones y sala de puja inversa (LX-53). */
export default function SupplierSection({ org }: { org: UserOrganization }) {
  return (
    <section className="space-y-2 rounded-lg border p-4">
      <h2 className="font-medium">Ventas de {org.legal_name}</h2>
      <p className="text-sm text-muted-foreground">
        Oportunidades e inscripciones: en construcción (LX-53).
      </p>
    </section>
  )
}
