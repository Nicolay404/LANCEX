import { lazy, Suspense, type ReactNode } from 'react'
import { NavLink, useParams, useRoutes, type RouteObject } from 'react-router'

import type { UserOrganization } from '@/api/types'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { PageLoading } from '@/components/PageLoading'
import {
  BUYER_ORG_CAPS,
  findOrganization,
  OrgCap,
  orgHasAny,
  SUPPLIER_ORG_CAPS,
} from '@/features/auth/capabilities'
import { useMe } from '@/features/auth/session'
import { MEMBER_ROLE_LABEL, VERIFICATION_LABEL } from '@/features/organizations/types'
import { cn } from '@/lib/utils'

import { MembersPage } from './MembersPage'
import { OrgOverview } from './OrgOverview'
import { OrgProfilePage } from './OrgProfilePage'

// Cada lado del B2B es un paquete propio: solo se descarga si la organización tiene esa capacidad.
const BuyerRoutes = lazy(() => import('@/packages/org-buyer/BuyerSection'))
const SupplierRoutes = lazy(() => import('@/packages/org-supplier/SupplierSection'))

const suspense = (node: ReactNode) => <Suspense fallback={<PageLoading />}>{node}</Suspense>

/** Subrutas según las capacidades de ESTA organización (`/auth/me`). Lo demás es 404. */
function orgRoutes(org: UserOrganization): RouteObject[] {
  const routes: RouteObject[] = [
    { index: true, element: <OrgOverview org={org} /> },
    { path: 'miembros', element: <MembersPage org={org} /> },
  ]
  if (org.capabilities.includes(OrgCap.ORG_EDIT_PROFILE)) {
    routes.push({ path: 'perfil', element: <OrgProfilePage org={org} /> })
  }
  if (orgHasAny(org, BUYER_ORG_CAPS)) {
    routes.push({ path: 'compras/*', element: suspense(<BuyerRoutes org={org} />) })
  }
  if (orgHasAny(org, SUPPLIER_ORG_CAPS)) {
    routes.push({ path: 'oportunidades/*', element: suspense(<SupplierRoutes org={org} />) })
  }
  routes.push({ path: '*', element: <NotFoundPage /> })
  return routes
}

/** `/org/:orgId/*` — contexto de organización. Una organización ajena es 404, no 403. */
export default function OrgHomePage() {
  const me = useMe()
  const { orgId } = useParams()
  const org = findOrganization(me, orgId)
  if (!org) return <NotFoundPage />
  return <OrgLayout key={org.id} org={org} />
}

function OrgLayout({ org }: { org: UserOrganization }) {
  const element = useRoutes(orgRoutes(org))
  const tabs: [string, string][] = [['', 'Resumen']]
  if (orgHasAny(org, BUYER_ORG_CAPS)) tabs.push(['compras', 'Compras'])
  if (orgHasAny(org, SUPPLIER_ORG_CAPS)) tabs.push(['oportunidades', 'Oportunidades'])
  tabs.push(['miembros', 'Miembros'])
  if (org.capabilities.includes(OrgCap.ORG_EDIT_PROFILE)) tabs.push(['perfil', 'Perfil'])

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{org.legal_name}</p>
          <p className="text-xs text-muted-foreground">
            {[
              org.is_buyer && 'Compradora',
              org.is_supplier && 'Proveedora',
              VERIFICATION_LABEL[org.verification_status] ?? org.verification_status,
              MEMBER_ROLE_LABEL[org.role] ?? org.role,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <nav aria-label="Secciones de la organización" className="flex flex-wrap gap-1 border-b">
          {tabs.map(([to, label]) => (
            <NavLink
              key={label}
              to={to ? `/org/${org.id}/${to}` : `/org/${org.id}`}
              end={!to}
              className={({ isActive }) =>
                cn(
                  '-mb-px border-b-2 px-3 py-2 text-sm',
                  isActive
                    ? 'border-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      {element}
    </div>
  )
}
