import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { ME_QUERY_KEY, useMe } from '@/features/auth/session'
import { createOrganization } from '@/features/organizations/api'
import { OrganizationForm } from '@/features/organizations/OrganizationForm'
import { MEMBER_ROLE_LABEL, VERIFICATION_LABEL } from '@/features/organizations/types'

/** `/organizaciones` (capacidad `organization.create`): mis organizaciones y alta de una nueva. */
export default function OrganizationsPage() {
  const me = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const mutation = useMutation({
    mutationFn: createOrganization,
    onSuccess: async (org) => {
      // Las capacidades por organización llegan en /auth/me: se recarga antes de entrar.
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
      void navigate(`/org/${org.id}`, { state: { created: true } })
    },
  })
  const orgs = me?.organizations ?? []

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Organizaciones</h1>
        {!creating && <Button onClick={() => setCreating(true)}>Registrar organización</Button>}
      </header>

      {creating && (
        <div className="space-y-3 rounded-xl border p-5">
          <h2 className="font-medium">Nueva organización</h2>
          <p className="text-sm text-muted-foreground">
            Quedará pendiente hasta que un moderador la verifique. Mientras tanto no puede publicar
            necesidades ni inscribirse en subastas inversas.
          </p>
          <OrganizationForm
            submitLabel="Registrar"
            pendingLabel="Registrando…"
            pending={mutation.isPending}
            error={mutation.error}
            onSubmit={(v) => mutation.mutate(v)}
          />
          <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
            Cancelar
          </Button>
        </div>
      )}

      {orgs.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Todavía no perteneces a ninguna organización.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {orgs.map((o) => (
            <li key={o.id}>
              <Link
                to={`/org/${o.id}`}
                className="block space-y-1 rounded-xl border p-4 hover:border-foreground/30"
              >
                <p className="font-medium">{o.legal_name}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    o.is_buyer && 'Compradora',
                    o.is_supplier && 'Proveedora',
                    VERIFICATION_LABEL[o.verification_status],
                    MEMBER_ROLE_LABEL[o.role] ?? o.role,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
