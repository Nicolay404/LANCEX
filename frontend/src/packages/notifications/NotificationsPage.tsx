import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'

import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Button } from '@/components/ui/button'
import {
  fetchNotifications,
  markAllRead,
  markRead,
  notificationKeys,
  type AppNotification,
} from '@/features/notifications/api'
import { notificationLink, notificationText } from '@/features/notifications/messages'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'

/** Icono y color por tipo (`notifications/services.TYPES`); los tipos nuevos usan el genérico. */
const KIND: Record<string, { icon: string; tone: string; label: string }> = {
  outbid: { icon: 'M3 7l6 6 4-4 8 8M15 17h6v-6', tone: 'red', label: 'Te superaron' },
  auction_won: {
    icon: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
    tone: 'amber',
    label: 'Ganaste',
  },
  auction_lost: { icon: 'M18 6 6 18M6 6l12 12', tone: 'slate', label: 'Subasta terminada' },
  auction_closed_owner: { icon: 'M20 6 9 17l-5-5', tone: 'emerald', label: 'Vendida' },
  auction_unsold_owner: { icon: 'M18 6 6 18M6 6l12 12', tone: 'slate', label: 'Sin venta' },
  auction_cancelled: {
    icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
    tone: 'red',
    label: 'Cancelada',
  },
  participant_admitted: { icon: 'M20 6 9 17l-5-5', tone: 'emerald', label: 'Admitida' },
  participant_rejected: { icon: 'M18 6 6 18M6 6l12 12', tone: 'red', label: 'No admitida' },
  watch_auction_started: {
    icon: 'M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    tone: 'blue',
    label: 'Empezó',
  },
  watch_auction_ending: {
    icon: 'M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    tone: 'amber',
    label: 'Termina pronto',
  },
  organization_verified: {
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
    tone: 'emerald',
    label: 'Organización',
  },
  organization_rejected: {
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM15 9l-6 6M9 9l6 6',
    tone: 'red',
    label: 'Organización',
  },
  report_resolved: {
    icon: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
    tone: 'blue',
    label: 'Reporte',
  },
  rating_received: {
    icon: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
    tone: 'amber',
    label: 'Calificación',
  },
}
const GENERIC = {
  icon: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  tone: 'blue',
  label: 'Aviso',
}
const TONE: Record<string, string> = {
  red: 'bg-red-500/15 text-red-300',
  amber: 'bg-amber-500/15 text-amber-300',
  emerald: 'bg-emerald-500/15 text-emerald-300',
  blue: 'bg-primary/20 text-link',
  slate: 'bg-white/10 text-white/70',
}

/** Día en hora de Guayaquil (`YYYY-MM-DD`), para agrupar. */
const dayKey = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Guayaquil',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const longDay = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const timeOnly = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  timeStyle: 'short',
})

function groupLabel(key: string, iso: string): string {
  const today = dayKey.format(new Date())
  const yesterday = dayKey.format(new Date(Date.now() - 86_400_000))
  if (key === today) return 'Hoy'
  if (key === yesterday) return 'Ayer'
  const s = longDay.format(new Date(iso))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function whenLabel(iso: string): string {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60_000)
  if (mins >= 0 && mins < 1) return 'ahora'
  if (mins >= 0 && mins < 60) return `hace ${mins} min`
  if (mins >= 0 && mins < 6 * 60) return `hace ${Math.floor(mins / 60)} h`
  return timeOnly.format(new Date(iso))
}

function groupByDay(items: AppNotification[]) {
  const groups: { key: string; label: string; items: AppNotification[] }[] = []
  for (const n of items) {
    const key = dayKey.format(new Date(n.created_at))
    const last = groups.at(-1)
    if (last && last.key === key) last.items.push(n)
    else groups.push({ key, label: groupLabel(key, n.created_at), items: [n] })
  }
  return groups
}

/** `/notificaciones` (capacidad `notification.read_own`). Polling cada 30 s. */
export default function NotificationsPage() {
  const [params, setParams] = useSearchParams()
  const unreadOnly = params.get('ver') === 'no-leidas'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const queryClient = useQueryClient()

  const list = useQuery({
    queryKey: notificationKeys.list(unreadOnly, page),
    queryFn: ({ signal }) => fetchNotifications(unreadOnly, page, 20, signal),
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  })
  // Misma consulta que la campana: comparten caché.
  const unread = useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: ({ signal }) => fetchNotifications(true, 1, 1, signal),
    refetchInterval: 30_000,
    select: (d) => d.count,
  })
  const unreadCount = unread.data ?? 0
  const refresh = () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all })
  const readOne = useMutation({ mutationFn: (id: number) => markRead([id]), onSuccess: refresh })
  const readAll = useMutation({ mutationFn: markAllRead, onSuccess: refresh })

  const go = (ver: string | null, p = 1) => {
    const next = new URLSearchParams()
    if (ver) next.set('ver', ver)
    if (p > 1) next.set('page', String(p))
    setParams(next, { replace: true })
  }

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            Centro de avisos
          </p>
          <h1 className="flex items-center gap-3 text-3xl font-extrabold text-white sm:text-4xl">
            Notificaciones
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary px-3 py-0.5 text-sm font-bold text-white">
                {unreadCount} <span className="sr-only">sin leer</span>
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            Pujas superadas, resultados de subastas y avisos de tus organizaciones.
          </p>
        </div>
        <Button
          variant="light"
          onClick={() => readAll.mutate()}
          disabled={readAll.isPending || unreadCount === 0}
        >
          Marcar todas como leídas
        </Button>
      </header>

      <div
        role="tablist"
        aria-label="Filtro"
        className="inline-flex gap-1 rounded-xl border border-white/[0.08] bg-card p-1"
      >
        {[
          { label: 'Todas', ver: null },
          { label: 'No leídas', ver: 'no-leidas' },
        ].map((t) => {
          const selected = (t.ver === 'no-leidas') === unreadOnly
          return (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => go(t.ver)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                selected ? 'bg-primary text-white' : 'text-white/65 hover:text-white',
              )}
            >
              {t.label}
              {t.ver && unreadCount > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    'ml-2 rounded-full px-1.5 text-xs',
                    selected ? 'bg-white/25' : 'bg-white/10',
                  )}
                >
                  {unreadCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {readAll.isError && <ErrorAlert error={readAll.error} />}
      {list.isPending ? (
        <PageLoading />
      ) : list.isError ? (
        <ErrorAlert error={list.error} />
      ) : list.data.results.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-white/10 bg-card/50 px-6 py-14 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-link ring-1 ring-primary/40">
            <Icon d={GENERIC.icon} className="size-7" />
          </span>
          <p className="text-lg font-bold text-white">
            {unreadOnly ? 'Estás al día' : 'Aún no tienes notificaciones'}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {unreadOnly
              ? 'No tienes notificaciones sin leer.'
              : 'Te avisaremos cuando te superen, cuando termine una subasta o cuando empiece una que sigues.'}
          </p>
          <Button asChild className="mt-2">
            <Link to="/?status=active">Explorar subastas en vivo</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-8">
            {groupByDay(list.data.results).map((g) => (
              <section key={g.key} aria-label={g.label} className="space-y-3">
                <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                  {g.label}
                </h2>
                <ul className="space-y-3">
                  {g.items.map((n) => (
                    <NotificationItem key={n.id} n={n} onRead={() => readOne.mutate(n.id)} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {(list.data.previous || list.data.next) && (
            <nav aria-label="Páginas" className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={!list.data.previous}
                onClick={() => go(unreadOnly ? 'no-leidas' : null, page - 1)}
              >
                ← Anterior
              </Button>
              <span className="rounded-lg border border-white/[0.08] bg-card px-4 py-1.5 text-sm font-semibold">
                Página {page}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!list.data.next}
                onClick={() => go(unreadOnly ? 'no-leidas' : null, page + 1)}
              >
                Siguiente →
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  )
}

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={cn('size-5', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

function NotificationItem({ n, onRead }: { n: AppNotification; onRead: () => void }) {
  const unread = !n.read_at
  const link = notificationLink(n)
  const text = notificationText(n)
  const kind = KIND[n.type] ?? GENERIC
  return (
    <li
      className={cn(
        'relative flex items-start gap-4 overflow-hidden rounded-2xl border p-4 transition-colors sm:p-5',
        unread
          ? 'border-primary/40 bg-primary/[0.07]'
          : 'border-white/[0.07] bg-card hover:border-white/15',
      )}
    >
      {unread && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary" />}
      <span
        className={cn(
          'inline-flex size-11 shrink-0 items-center justify-center rounded-xl',
          TONE[kind.tone],
        )}
      >
        <Icon d={kind.icon} />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex flex-wrap items-center gap-2 text-xs">
          <span className={cn('rounded-md px-2 py-0.5 font-semibold', TONE[kind.tone])}>
            {kind.label}
          </span>
          <time
            dateTime={n.created_at}
            title={formatDateTime(n.created_at)}
            className="text-muted-foreground"
          >
            {whenLabel(n.created_at)}
          </time>
          {unread && (
            <span className="font-semibold text-link">
              • Nueva<span className="sr-only"> · sin leer</span>
            </span>
          )}
        </p>
        {link ? (
          <Link
            to={link}
            onClick={() => unread && onRead()}
            className={cn(
              'block text-[15px] leading-snug hover:text-link',
              unread ? 'font-semibold text-white' : 'text-white/80',
            )}
          >
            {text}
          </Link>
        ) : (
          <p
            className={cn(
              'text-[15px] leading-snug',
              unread ? 'font-semibold text-white' : 'text-white/80',
            )}
          >
            {text}
          </p>
        )}
      </div>
      {unread && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRead}
          className="shrink-0 text-link hover:text-white"
        >
          Marcar leída
        </Button>
      )}
    </li>
  )
}
