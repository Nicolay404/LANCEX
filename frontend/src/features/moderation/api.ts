import { api } from '@/api/client'
import type { Paginated, Uuid } from '@/api/types'

import type {
  ModerationAuction,
  ModerationReport,
  ModerationSummary,
  OrganizationReview,
  OrganizationReviewDetail,
  ReportStatus,
  ResolveAction,
  StaffUserRow,
  UserFile,
} from './types'

const id = (x: Uuid) => encodeURIComponent(x)

export const modKeys = {
  all: ['moderation'] as const,
  summary: ['moderation', 'summary'] as const,
  reports: (status: string, page: number) => ['moderation', 'reports', status, page] as const,
  auction: (auctionId: Uuid) => ['moderation', 'auction', auctionId] as const,
  user: (userId: Uuid) => ['moderation', 'user', userId] as const,
  orgs: (status: string, page: number) => ['moderation', 'orgs', status, page] as const,
  org: (orgId: Uuid) => ['moderation', 'org', orgId] as const,
}

const pageQuery = (page: number) => ({ page: page > 1 ? page : undefined, page_size: 20 })

export const fetchModerationSummary = (signal?: AbortSignal) =>
  api.get<ModerationSummary>('/moderation/summary/', { signal })

export const fetchReports = (status: ReportStatus | '', page: number, signal?: AbortSignal) =>
  api.get<Paginated<ModerationReport>>('/moderation/reports/', {
    signal,
    query: { status: status || undefined, ...pageQuery(page) },
  })

/** `dismissed` va con `action: none`; `actioned` exige cancelar la subasta o suspender. */
export const resolveReport = (
  reportId: Uuid,
  body: { status: 'dismissed' | 'actioned'; note: string; action: ResolveAction },
) => api.post<ModerationReport>(`/moderation/reports/${id(reportId)}/resolve/`, body)

export const fetchModerationAuction = (auctionId: Uuid, signal?: AbortSignal) =>
  api.get<ModerationAuction>(`/moderation/auctions/${id(auctionId)}/`, { signal })

export const moderatorCancelAuction = (auctionId: Uuid, reason: string) =>
  api.post<{ id: Uuid; status: string; cancel_reason: string }>(
    `/moderation/auctions/${id(auctionId)}/cancel/`,
    { reason },
  )

export const fetchUserFile = (userId: Uuid, signal?: AbortSignal) =>
  api.get<UserFile>(`/moderation/users/${id(userId)}/`, { signal })

export const suspendUser = (userId: Uuid, reason: string) =>
  api.post<StaffUserRow>(`/moderation/users/${id(userId)}/suspend/`, { reason })

export const fetchOrganizationsForReview = (status: string, page: number, signal?: AbortSignal) =>
  api.get<Paginated<OrganizationReview>>('/moderation/organizations/', {
    signal,
    query: { status: status || undefined, ...pageQuery(page) },
  })

export const fetchOrganizationReview = (orgId: Uuid, signal?: AbortSignal) =>
  api.get<OrganizationReviewDetail>(`/moderation/organizations/${id(orgId)}/`, { signal })

export const decideOrganization = (orgId: Uuid, status: 'verified' | 'rejected', note: string) =>
  api.post<OrganizationReview>(`/moderation/organizations/${id(orgId)}/decision/`, {
    status,
    note,
  })
