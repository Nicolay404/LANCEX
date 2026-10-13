import { api } from '@/api/client'
import type { Paginated } from '@/api/types'

import type {
  ActivityEvent,
  MySummary,
  Participation,
  ParticipationTab,
  UserSessionInfo,
} from './types'

export const meKeys = {
  summary: ['me', 'summary'] as const,
  participations: (tab: ParticipationTab, page: number) =>
    ['me', 'participations', tab, page] as const,
  activity: (page: number) => ['me', 'activity', page] as const,
  sessions: ['auth', 'sessions'] as const,
}

export const fetchSummary = (signal?: AbortSignal) => api.get<MySummary>('/me/summary/', { signal })

export const fetchParticipations = (tab: ParticipationTab, page: number, signal?: AbortSignal) =>
  api.get<Paginated<Participation>>('/me/participations/', {
    signal,
    query: { tab, page: page > 1 ? page : undefined, page_size: 20 },
  })

export const fetchActivity = (page: number, signal?: AbortSignal) =>
  api.get<Paginated<ActivityEvent>>('/me/activity/', {
    signal,
    query: { page: page > 1 ? page : undefined, page_size: 20 },
  })

export const fetchSessions = (signal?: AbortSignal) =>
  api.get<{ results: UserSessionInfo[] }>('/auth/sessions/', { signal })

/** Cierra las demás sesiones; la actual sigue válida. */
export const revokeOtherSessions = () =>
  api.post<{ revoked: number }>('/auth/sessions/revoke-others/')
