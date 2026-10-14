import { NavLink, Outlet, useMatch, useNavigate } from 'react-router'

import type { UserMe } from '@/api/types'
import { Logo } from '@/components/Logo'
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
    to: '/organizaciones',
    label: 'Organizaciones',
    visible: (me) => hasCapability(me, Cap.ORGANIZATION_CREATE),
  },
  {
    to: '/moderacion',
    label: 'Moderación',
    visible: (me) => hasAnyCapability(me, MODERATION_CAPS),
  },
  { to: '/admin', label: 'Administración', visible: (me) => hasAnyCapability(me, ADMIN_CAPS) },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative rounded-lg px-3 py-2 text-[15px] font-medium transition-colors duration-200',
    'text-foreground/70 hover:text-white',
    isActive &&
      'text-link after:absolute after:inset-x-2.5 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-primary hover:text-white',
  )

export function AppLayout() {
  const me = useMe()

  return (
    <div className="flex min-h-svh flex-col">
      {/* Header con glassmorphism premium */}
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex min-h-20 w-full max-w-[1920px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6 lg:px-10 2xl:px-14">
          <div className="flex flex-wrap items-center gap-6">
            <NavLink to="/" aria-label="LANCEX, inicio" className="shrink-0">
              <Logo size="lg" />
            </NavLink>
            <nav aria-label="Principal" className="flex flex-wrap items-center gap-0.5 text-sm">
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

      <main className="mx-auto w-full max-w-[1920px] flex-1 px-4 py-8 sm:px-6 lg:px-10 2xl:px-14">
        <Outlet />
      </main>

      <Footer />
    </div>
  )
}

function Footer() {
  return (
    <footer className="mt-20 overflow-hidden border-t border-white/[0.07] bg-brand-deep">
      <div className="mx-auto w-full max-w-[1920px] px-4 py-14 sm:px-6 lg:px-10 2xl:px-14">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr_1fr]">
          {/* Columna marca */}
          <div className="space-y-4">
            <Logo />
            <p className="max-w-xs text-sm leading-relaxed text-white/65">
              Subastas en línea con reglas transparentes: ascendente, sobre cerrado, cierre por vela
              y compras B2B a la baja.
            </p>
            <p className="text-xs text-white/55">
              LANCEX no procesa pagos ni envíos. Comprador y vendedor coordinan la entrega.
            </p>
            {/* Badges de modalidades */}
            <div className="flex flex-wrap gap-2 pt-1">
              {['Ascendente', 'Sobre cerrado', 'Vela', 'Inversa B2B'].map((m) => (
                <span
                  key={m}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-white/65"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>

          {/* Columna Explorar */}
          <div className="space-y-3">
            <p className="text-xs font-bold tracking-widest text-white uppercase">Explorar</p>
            <ul className="space-y-2.5 text-sm text-white/65">
              <li>
                <NavLink
                  to="/?status=active"
                  className="flex items-center gap-2 transition-colors hover:text-white"
                >
                  <span className="size-1.5 rounded-full bg-live animate-pulse" />
                  Subastas en vivo
                </NavLink>
              </li>
              <li>
                <NavLink to="/?status=scheduled" className="transition-colors hover:text-white">
                  Próximas subastas
                </NavLink>
              </li>
              <li>
                <NavLink to="/?mechanism=reverse" className="transition-colors hover:text-white">
                  Compras B2B
                </NavLink>
              </li>
            </ul>
          </div>

          {/* Columna Modalidades */}
          <div className="space-y-3">
            <p className="text-xs font-bold tracking-widest text-white uppercase">Modalidades</p>
            <ul className="space-y-2.5 text-sm text-white/65">
              <li>Ascendente con puja automática</li>
              <li>Sobre cerrado</li>
              <li>Cierre por vela verificable</li>
              <li>Inversa entre organizaciones</li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-12 flex items-center justify-between border-t border-white/[0.07] pt-6">
          <p className="text-xs text-white/50">
            LANCEX · plataforma de subastas · proyecto académico
          </p>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary/60 animate-pulse" />
            <span className="text-xs text-white/50">Sistema activo</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

function GuestMenu() {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Button asChild variant="light" className="h-11 px-6">
        <NavLink to="/ingresar">Ingresar</NavLink>
      </Button>
      <Button asChild className="h-11 px-6">
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
      {hasCapability(me, Cap.AUCTION_CREATE_PERSONAL) && (
        <Button asChild className="h-11 px-6">
          <NavLink to="/mis-subastas/nueva">Crear subasta</NavLink>
        </Button>
      )}
      {hasCapability(me, Cap.NOTIFICATION_READ_OWN) && <NotificationBell />}
      {hasCapability(me, Cap.ACCOUNT_MANAGE_OWN) && (
        <NavLink
          to="/cuenta"
          className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-[15px] font-medium transition-all 2xl:px-3.5 2xl:py-2 hover:border-primary/40 hover:bg-primary/5 hover:text-white"
          title="Mi cuenta"
        >
          {/* Avatar con inicial */}
          <span
            aria-hidden
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-link"
          >
            {me.display_name.charAt(0).toUpperCase()}
          </span>
          <span className="max-w-28 truncate max-2xl:sr-only">{me.display_name}</span>
        </NavLink>
      )}
      <Button
        variant="ghost"
        onClick={() => void logout()}
        disabled={pending}
        className="h-11 text-[15px] text-foreground/60 hover:text-foreground"
      >
        {pending ? 'Saliendo…' : 'Salir'}
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
        className="h-11 max-w-40 truncate rounded-lg border border-border bg-card px-3 text-[15px] font-medium transition-colors hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring/50"
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
