import { api } from '@/api/client'
import type { IsoDateTime, Paginated, Uuid } from '@/api/types'

/** `NotificationSerializer`: `data` solo trae datos públicos (lista blanca del backend). */
export interface AppNotification {
  id: number
  type: string
  auction_id: Uuid | null
  data: {
    title?: string
    current_price?: string
    final_price?: string
    outcome?: string
    ends_at?: string
    reason?: string
    organization_name?: string
    target_type?: string
  }
  created_at: IsoDateTime
  read_at: IsoDateTime | null
}

export const notificationKeys = {
  all: ['notifications'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
  list: (unread: boolean, page: number) => ['notifications', 'list', unread, page] as const,
}

export const fetchNotifications = (
  unread: boolean,
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
) =>
  api.get<Paginated<AppNotification>>('/notifications/', {
    signal,
    query: {
      unread: unread ? 'true' : undefined,
      page: page > 1 ? page : undefined,
      page_size: pageSize,
    },
  })

export const markRead = (ids: number[]) =>
  api.post<{ updated: number }>('/notifications/read/', { ids })
export const markAllRead = () =>
  api.post<{ updated: number }>('/notifications/read/', { all: true })
