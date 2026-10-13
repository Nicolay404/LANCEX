import type { ReactElement } from 'react'
import { NavLink, Navigate, useRoutes, type RouteObject } from 'react-router'

import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { Cap, hasCapability } from '@/features/auth/capabilities'
import { useMe } from '@/features/auth/session'
import { cn } from '@/lib/utils'

import { AuditPage } from './AuditPage'
import { CategoriesPage } from './CategoriesPage'
import { SystemHealthPage } from './SystemHealthPage'
import { UsersPage } from './UsersPage'

/**
 * `/admin/*` (paquete `admin`, LX-73). Cada subruta existe solo con su capacidad (`/auth/me`).
 * `/admin` lleva a la primera sección disponible.
 */
export default function AdminHomePage() {
  const me = useMe()
  const sections: {
    path: string
    label: string
    cap: Parameters<typeof hasCapability>[1]
    element: ReactElement
  }[] = [
    { path: 'usuarios', label: 'Usuarios', cap: Cap.ADMIN_MANAGE_USERS, element: <UsersPage /> },
    {
      path: 'categorias',
      label: 'Categorías',
      cap: Cap.ADMIN_MANAGE_CATEGORIES,
      element: <CategoriesPage />,
    },
    { path: 'auditoria', label: 'Auditoría', cap: Cap.ADMIN_VIEW_AUDIT, element: <AuditPage /> },
    {
      path: 'sistema',
      label: 'Sistema',
      cap: Cap.ADMIN_VIEW_SYSTEM_HEALTH,
      element: <SystemHealthPage />,
    },
  ].filter((s) => hasCapability(me, s.cap))

  const routes: RouteObject[] = sections.map((s) => ({ path: s.path, element: s.element }))
  if (sections[0])
    routes.push({ index: true, element: <Navigate to={`/admin/${sections[0].path}`} replace /> })
  routes.push({ path: '*', element: <NotFoundPage /> })
  const element = useRoutes(routes)

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Administración</h1>
        <nav aria-label="Administración" className="flex flex-wrap gap-1 border-b">
          {sections.map((s) => (
            <NavLink
              key={s.path}
              to={`/admin/${s.path}`}
              className={({ isActive }) =>
                cn(
                  '-mb-px border-b-2 px-3 py-2 text-sm',
                  isActive
                    ? 'border-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )
              }
            >
              {s.label}
            </NavLink>
          ))}
        </nav>
      </header>
      {element}
    </div>
  )
}
