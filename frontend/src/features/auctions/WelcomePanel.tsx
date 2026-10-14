import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import type { UserMe } from '@/api/types'
import { LogoMark } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Cap, hasCapability } from '@/features/auth/capabilities'
import { fetchSummary, meKeys } from '@/features/me/api'
import { cn } from '@/lib/utils'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/**
 * Portada con sesión: saludo, accesos según capacidades y el resumen personal
 * (`GET /me/summary/`, solo si puede pujar). Reemplaza al héroe de visitante.
 */
export function WelcomePanel({ me }: { me: UserMe }) {
  const canBid = hasCapability(me, Cap.BID_PLACE)
  const summary = useQuery({
    queryKey: meKeys.summary,
    queryFn: ({ signal }) => fetchSummary(signal),
    refetchInterval: 30_000,
    enabled: canBid,
  })
  const s = summary.data
  const firstName = me.display_name.split(' ')[0] ?? me.display_name

  const stats = s
    ? [
        {
          label: 'Vas ganando',
          value: s.participations.leading,
          to: '/mis-pujas',
          tone: 'text-emerald-300',
        },
        {
          label: 'Te superaron',
          value: s.participations.outbid,
          to: '/mis-pujas',
          tone: 'text-red-300',
        },
        {
          label: 'Mis subastas activas',
          value: s.my_auctions.scheduled_or_active,
          to: '/mis-subastas?estado=active',
          tone: 'text-link',
        },
        {
          label: 'Avisos sin leer',
          value: s.unread_notifications,
          to: '/notificaciones',
          tone: 'text-amber-300',
        },
      ]
    : []

  return (
    <section
      aria-labelledby="welcome-title"
      className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-card"
    >
      <div aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-primary" />
      <div
        aria-hidden
        className="absolute -top-24 right-1/3 size-72 rounded-full bg-primary/15 blur-3xl"
      />
      <LogoMark className="pointer-events-none absolute -right-10 -bottom-16 h-72 w-auto opacity-[0.06]" />

      <div className="relative grid items-center gap-8 px-6 py-8 sm:px-10 xl:grid-cols-[1fr_auto]">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">{greeting()},</p>
            <h1 id="welcome-title" className="text-3xl font-extrabold text-white sm:text-4xl">
              {firstName}. <span className="accent-word">¿Qué subastamos hoy?</span>
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            {hasCapability(me, Cap.AUCTION_CREATE_PERSONAL) && (
              <Button asChild size="lg">
                <Link to="/mis-subastas/nueva">Crear subasta</Link>
              </Button>
            )}
            {canBid && (
              <Button asChild size="lg" variant="light">
                <Link to="/mis-pujas">Mis pujas</Link>
              </Button>
            )}
            {hasCapability(me, Cap.LISTING_MANAGE_OWN) && (
              <Button asChild size="lg" variant="light">
                <Link to="/mis-publicaciones">Mis publicaciones</Link>
              </Button>
            )}
            <Link
              to="/?status=active"
              className="inline-flex h-12 items-center px-1 text-base font-semibold text-link hover:text-white"
            >
              Explorar en vivo →
            </Link>
          </div>
        </div>

        {canBid && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:w-[40rem]">
            {(stats.length ? stats : PLACEHOLDER).map((t) => (
              <li key={t.label}>
                <Link
                  to={t.to}
                  className="flex h-full flex-col justify-between gap-3 rounded-2xl border border-white/[0.08] bg-background/60 p-4 transition-colors hover:border-primary/50"
                >
                  <span className="text-xs font-medium text-muted-foreground">{t.label}</span>
                  <span
                    className={cn(
                      'text-3xl font-extrabold tabular-nums',
                      t.value > 0 ? t.tone : 'text-white/40',
                    )}
                  >
                    {summary.isPending ? '–' : t.value}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

const PLACEHOLDER = [
  { label: 'Vas ganando', value: 0, to: '/mis-pujas', tone: '' },
  { label: 'Te superaron', value: 0, to: '/mis-pujas', tone: '' },
  { label: 'Mis subastas activas', value: 0, to: '/mis-subastas', tone: '' },
  { label: 'Avisos sin leer', value: 0, to: '/notificaciones', tone: '' },
]
