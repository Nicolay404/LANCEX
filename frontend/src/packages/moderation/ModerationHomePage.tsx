import { NavLink, useRoutes, type RouteObject } from 'react-router'

import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { Cap, hasCapability } from '@/features/auth/capabilities'
import { useMe } from '@/features/auth/session'
import { cn } from '@/lib/utils'

import { AuctionModerationPage } from './AuctionModerationPage'
import { Inbox } from './Inbox'
import { OrganizationReviewPage, OrganizationsReviewPage } from './OrganizationsReviewPage'
import { ReportsPage } from './ReportsPage'
import { UserFilePage } from './UserFilePage'

/**
 * `/moderacion/*` (paquete `moderation`, LX-78). Cada subruta existe solo con su capacidad de
 * staff (`/auth/me`); lo demás es la 404 única. El backend vuelve a validar todo.
 */
export default function ModerationHomePage() {
  const me = useMe()
  const can = (cap: Parameters<typeof hasCapability>[1]) => hasCapability(me, cap)

  const routes: RouteObject[] = []
  const tabs: [string, string][] = []
  if (can(Cap.MODERATION_REVIEW_REPORTS)) {
    routes.push({ index: true, element: <Inbox /> })
    tabs.push(['', 'Bandeja'])
  }
  if (can(Cap.MODERATION_VERIFY_ORGANIZATIONS)) {
    routes.push(
      { path: 'organizaciones', element: <OrganizationsReviewPage /> },
      { path: 'organizaciones/:orgId', element: <OrganizationReviewPage /> },
    )
    tabs.push(['organizaciones', 'Organizaciones'])
  }
  if (can(Cap.MODERATION_REVIEW_REPORTS)) {
    routes.push({ path: 'reportes', element: <ReportsPage /> })
    tabs.push(['reportes', 'Reportes'])
  }
  if (can(Cap.MODERATION_VIEW_AUCTION_INTERNALS)) {
    routes.push({ path: 'subastas/:auctionId', element: <AuctionModerationPage /> })
  }
  if (can(Cap.MODERATION_SUSPEND_USER)) {
    routes.push({ path: 'usuarios/:userId', element: <UserFilePage /> })
  }
  routes.push({ path: '*', element: <NotFoundPage /> })
  const element = useRoutes(routes)

  return (
    <div className="space-y-6">
      <nav aria-label="Moderación" className="flex flex-wrap gap-1 border-b">
        {tabs.map(([to, label]) => (
          <NavLink
            key={label}
            to={to ? `/moderacion/${to}` : '/moderacion'}
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
      {element}
    </div>
  )
}
