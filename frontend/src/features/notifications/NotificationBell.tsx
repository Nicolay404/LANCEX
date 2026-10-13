import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { fetchNotifications, notificationKeys } from './api'

/**
 * Campana con el número de no leídas. Polling cada 30 s solo con la pestaña visible (ADR-0004);
 * pide 1 elemento porque solo interesa `count`.
 */
export function NotificationBell() {
  const unread = useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: ({ signal }) => fetchNotifications(true, 1, 1, signal),
    refetchInterval: 30_000,
    select: (d) => d.count,
  })
  const count = unread.data ?? 0
  const label = count === 0 ? 'Notificaciones' : `Notificaciones: ${count} sin leer`
  return (
    <Link
      to="/notificaciones"
      aria-label={label}
      title={label}
      className="relative inline-flex size-9 items-center justify-center rounded-lg hover:bg-accent"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
