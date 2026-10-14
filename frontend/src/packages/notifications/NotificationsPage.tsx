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
    <section className="max-w-2xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Notificaciones</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => readAll.mutate()}
          disabled={readAll.isPending}
        >
          Marcar todas como leídas
        </Button>
      </header>
      <div role="tablist" aria-label="Filtro" className="flex gap-1 border-b">
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
                '-mb-px border-b-2 px-3 py-2 text-sm',
                selected
                  ? 'border-foreground font-medium'
                  : 'border-transparent text-muted-foreground',
              )}
            >
              {t.label}
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
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {unreadOnly ? 'No tienes notificaciones sin leer.' : 'Todavía no tienes notificaciones.'}
        </p>
      ) : (
        <>
          <ul className="divide-y rounded-xl border">
            {list.data.results.map((n) => (
              <NotificationItem key={n.id} n={n} onRead={() => readOne.mutate(n.id)} />
            ))}
          </ul>
          {(list.data.previous || list.data.next) && (
            <nav aria-label="Páginas" className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={!list.data.previous}
                onClick={() => go(unreadOnly ? 'no-leidas' : null, page - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">Página {page}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!list.data.next}
                onClick={() => go(unreadOnly ? 'no-leidas' : null, page + 1)}
              >
                Siguiente
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  )
}

function NotificationItem({ n, onRead }: { n: AppNotification; onRead: () => void }) {
  const unread = !n.read_at
  const link = notificationLink(n)
  const text = notificationText(n)
  return (
    <li className={cn('flex items-start gap-3 p-4', unread && 'bg-accent/40')}>
      <span
        aria-hidden="true"
        className={cn(
          'mt-1.5 size-2 shrink-0 rounded-full',
          unread ? 'bg-primary' : 'bg-transparent',
        )}
      />
      <div className="min-w-0 flex-1 space-y-1">
        {link ? (
          <Link
            to={link}
            onClick={() => unread && onRead()}
            className={cn('text-sm hover:underline', unread && 'font-medium')}
          >
            {text}
          </Link>
        ) : (
          <p className={cn('text-sm', unread && 'font-medium')}>{text}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {formatDateTime(n.created_at)}
          {unread && <span className="sr-only"> · sin leer</span>}
        </p>
      </div>
      {unread && (
        <Button variant="ghost" size="sm" onClick={onRead}>
          Marcar leída
        </Button>
      )}
    </li>
  )
}
