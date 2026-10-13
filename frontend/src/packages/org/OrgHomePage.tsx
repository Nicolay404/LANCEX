import { lazy, Suspense } from 'react'
import { useParams } from 'react-router'

import { PageLoading } from '@/components/PageLoading'
import {
  BUYER_ORG_CAPS,
  findOrganization,
  orgHasAny,
  SUPPLIER_ORG_CAPS,
} from '@/features/auth/capabilities'
import { useMe } from '@/features/auth/session'
import { NotFoundPage } from '@/app/pages/NotFoundPage'

// Cada lado del B2B es un paquete propio: solo se descarga si la organización tiene esa capacidad.
const BuyerSection = lazy(() => import('@/packages/org-buyer/BuyerSection'))
const SupplierSection = lazy(() => import('@/packages/org-supplier/SupplierSection'))

const VERIFICATION_LABEL: Record<string, string> = {
  pending: 'Verificación pendiente',
  verified: 'Verificada',
  rejected: 'Rechazada',
}

/** `/org/:orgId` — contexto de organización. Una organización ajena es 404, no 403. */
export default function OrgHomePage() {
  const me = useMe()
  const { orgId } = useParams()
  const org = findOrganization(me, orgId)
  if (!org) return <NotFoundPage />

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{org.legal_name}</h1>
        <p className="text-sm text-muted-foreground">
          {VERIFICATION_LABEL[org.verification_status] ?? org.verification_status} · rol {org.role}
        </p>
      </header>
      <Suspense fallback={<PageLoading />}>
        {orgHasAny(org, BUYER_ORG_CAPS) && <BuyerSection org={org} />}
        {orgHasAny(org, SUPPLIER_ORG_CAPS) && <SupplierSection org={org} />}
      </Suspense>
    </div>
  )
}
