import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router'

import type { UserOrganization } from '@/api/types'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { BUYER_ORG_CAPS, orgHasAny, SUPPLIER_ORG_CAPS } from '@/features/auth/capabilities'
import { fetchOrganization, orgKeys } from '@/features/organizations/api'
import { VERIFICATION_LABEL } from '@/features/organizations/types'
import { formatDateTime } from '@/lib/dates'

/** `/org/:orgId`: estado de verificación y accesos según capacidades. */
export function OrgOverview({ org }: { org: UserOrganization }) {
  const location = useLocation()
  const created = (location.state as { created?: boolean } | null)?.created
  const detail = useQuery({
    queryKey: orgKeys.detail(org.id),
    queryFn: ({ signal }) => fetchOrganization(org.id, signal),
  })
  const isBuyer = orgHasAny(org, BUYER_ORG_CAPS)
  const isSupplier = orgHasAny(org, SUPPLIER_ORG_CAPS)

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{org.legal_name}</h1>
      {created && <Alert variant="success">Organización registrada.</Alert>}
      {detail.isPending ? (
        <PageLoading />
      ) : detail.isError ? (
        <ErrorAlert error={detail.error} />
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted-foreground">RUC</dt>
            <dd className="tabular-nums">{detail.data.ruc}</dd>
            <dt className="text-muted-foreground">Estado</dt>
            <dd>
              {VERIFICATION_LABEL[detail.data.verification_status] ??
                detail.data.verification_status}
            </dd>
            <dt className="text-muted-foreground">Registrada</dt>
            <dd>{formatDateTime(detail.data.created_at)}</dd>
            <dt className="text-muted-foreground">Miembros activos</dt>
            <dd>{detail.data.members.filter((m) => m.status === 'active').length}</dd>
          </dl>
          {detail.data.verification_status === 'pending' && (
            <Alert>
              Un moderador revisará los datos. Hasta entonces la organización no puede publicar
              necesidades, crear subastas inversas ni inscribirse como proveedora.
            </Alert>
          )}
          {detail.data.verification_status === 'rejected' && (
            <Alert variant="destructive">
              Verificación rechazada
              {detail.data.verification_note ? `: ${detail.data.verification_note}` : '.'} Corrige
              el perfil para volver a solicitarla.
            </Alert>
          )}
        </>
      )}
      {(isBuyer || isSupplier) && (
        <div className="flex flex-wrap gap-2">
          {isBuyer && (
            <Button asChild>
              <Link to={`/org/${org.id}/compras/necesidades/nueva`}>Publicar necesidad</Link>
            </Button>
          )}
          {isSupplier && (
            <Button asChild variant="outline">
              <Link to={`/org/${org.id}/oportunidades`}>Ver oportunidades</Link>
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
