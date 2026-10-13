import { NavLink, Outlet, useMatch, useNavigate } from 'react-router'

import type { UserMe } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  ADMIN_CAPS,
  Cap,
  hasAnyCapability,
  hasCapability,
  MODERATION_CAPS,
} from '@/features/auth/capabilities'
import { useLogout, useMe } from '@/features/auth/session'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  end?: boolean
  visible: (me: UserMe | null) => boolean
}

// Menú construido SOLO desde `capabilities` (ADR-0006). Staff no ve el menú comercial.
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Subastas', end: true, visible: () => true },
  { to: '/panel', label: 'Mi actividad', visible: (me) => hasCapability(me, Cap.BID_PLACE) },
  {
    to: '/mis-subastas',
    label: 'Mis subastas',
    visible: (me) => hasCapability(me, Cap.AUCTION_MANAGE_OWN),
  },
  {
    to: '/mis-publicaciones',
    label: 'Mis publicaciones',
    visible: (me) => hasCapability(me, Cap.LISTING_MANAGE_OWN),
  },
  {
    to: '/moderacion',
    label: 'Moderación',
    visible: (me) => hasAnyCapability(me, MODERATION_CAPS),
  },
  { to: '/admin', label: 'Administración', visible: (me) => hasAnyCapability(me, ADMIN_CAPS) },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn('rounded-md px-3 py-1.5 hover:bg-accent', isActive && 'bg-accent font-medium')

export function AppLayout() {
  const me = useMe()

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
          <div className="flex flex-wrap items-center gap-4">
            <NavLink to="/" className="text-lg font-bold tracking-tight">
              LANCEX
            </NavLink>
            <nav aria-label="Principal" className="flex flex-wrap items-center gap-1 text-sm">
              {NAV_ITEMS.filter((i) => i.visible(me)).map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className={linkClass}>
                  {i.label}
                </NavLink>
              ))}
            </nav>
          </div>
          {me ? <UserMenu me={me} /> : <GuestMenu />}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted-foreground">
          LANCEX · plataforma de subastas
        </div>
      </footer>
    </div>
  )
}

function GuestMenu() {
  return (
    <div className="flex items-center gap-2 text-sm">
      <NavLink to="/ingresar" className={linkClass}>
        Ingresar
      </NavLink>
      <Button asChild size="sm">
        <NavLink to="/registro">Crear cuenta</NavLink>
      </Button>
    </div>
  )
}

function UserMenu({ me }: { me: UserMe }) {
  const { logout, pending } = useLogout()
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {me.organizations.length > 0 && <ContextSelector me={me} />}
      {hasCapability(me, Cap.NOTIFICATION_READ_OWN) && <NotificationBell />}
      {hasCapability(me, Cap.ACCOUNT_MANAGE_OWN) && (
        <NavLink to="/cuenta" className={linkClass} title="Mi cuenta">
          {me.display_name}
        </NavLink>
      )}
      <Button variant="ghost" size="sm" onClick={() => void logout()} disabled={pending}>
        {pending ? 'Saliendo…' : 'Cerrar sesión'}
      </Button>
    </div>
  )
}

/**
 * Contexto activo (Personal / Organización X). Vive en la URL (`/org/:orgId`), nunca en
 * localStorage: así no hay estado de rol manipulable en el navegador.
 */
function ContextSelector({ me }: { me: UserMe }) {
  const navigate = useNavigate()
  const match = useMatch('/org/:orgId/*')
  const current = match?.params.orgId ?? ''
  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Contexto activo</span>
      <select
        className="h-8 rounded-md border bg-background px-2 text-sm"
        value={current}
        onChange={(e) => void navigate(e.target.value ? `/org/${e.target.value}` : '/')}
      >
        <option value="">Personal</option>
        {me.organizations.map((o) => (
          <option key={o.id} value={o.id}>
            {o.legal_name}
          </option>
        ))}
      </select>
    </label>
  )
}
