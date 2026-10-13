import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { UserOrganization } from '@/api/types'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { ME_QUERY_KEY } from '@/features/auth/session'
import { fetchOrganization, orgKeys, updateOrganization } from '@/features/organizations/api'
import { OrganizationForm } from '@/features/organizations/OrganizationForm'
import type { OrganizationInput } from '@/features/organizations/types'

/** `/org/:orgId/perfil` (capacidad `org.edit_profile`). Solo se envían los campos cambiados. */
export function OrgProfilePage({ org }: { org: UserOrganization }) {
  const queryClient = useQueryClient()
  const detail = useQuery({
    queryKey: orgKeys.detail(org.id),
    queryFn: ({ signal }) => fetchOrganization(org.id, signal),
  })
  const mutation = useMutation({
    mutationFn: (changes: Partial<OrganizationInput>) => updateOrganization(org.id, changes),
    onSuccess: async (updated) => {
      queryClient.setQueryData(orgKeys.detail(org.id), updated)
      // Razón social, estado de verificación y capacidades llegan en /auth/me.
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
    },
  })

  if (detail.isPending) return <PageLoading />
  if (detail.isError) return <ErrorAlert error={detail.error} />
  const d = detail.data
  const initial: OrganizationInput = {
    legal_name: d.legal_name,
    ruc: d.ruc,
    is_buyer: d.is_buyer,
    is_supplier: d.is_supplier,
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Perfil de la organización</h1>
      {d.verification_status === 'verified' && (
        <Alert>
          Si cambias la razón social o el RUC, la organización vuelve a quedar pendiente de
          verificación.
        </Alert>
      )}
      {mutation.isSuccess && <Alert variant="success">Cambios guardados.</Alert>}
      <OrganizationForm
        key={`${d.legal_name}|${d.ruc}|${d.is_buyer}|${d.is_supplier}`}
        initial={initial}
        submitLabel="Guardar cambios"
        pendingLabel="Guardando…"
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={(v) => {
          const changes = Object.fromEntries(
            (Object.keys(v) as (keyof OrganizationInput)[])
              .filter((k) => v[k] !== initial[k])
              .map((k) => [k, v[k]]),
          ) as Partial<OrganizationInput>
          if (Object.keys(changes).length > 0) mutation.mutate(changes)
        }}
      />
    </section>
  )
}
