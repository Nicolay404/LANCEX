/** Administración (LX-79 backend / LX-73 frontend). */
import { api } from '@/api/client'
import type { IsoDateTime, Paginated, Uuid } from '@/api/types'
import type { AuditRow, StaffUserRow } from '@/features/moderation/types'

export interface AdminCategory {
  id: number
  name: string
  slug: string
  is_active: boolean
}

export interface SystemHealth {
  server_time: IsoDateTime
  close_jobs: {
    dev: string
    job: string
    last_run_at: IsoDateTime
    last_closed_count: number
    /** Más de 2 minutos sin latido. */
    stale: boolean
  }[]
  pending_closes: number
  counts: { users: number; open_auctions: number; closed_auctions: number; open_reports: number }
}

export interface UserFilters {
  q: string
  role: string
  status: string
}

export interface AuditFilters {
  auction_id: string
  actor_id: string
  action: string
  /** ISO con zona (se convierte desde la hora de Ecuador). */
  from: string
  to: string
}

export const adminKeys = {
  all: ['admin'] as const,
  users: (f: UserFilters, page: number) => ['admin', 'users', f, page] as const,
  categories: ['admin', 'categories'] as const,
  audit: (f: AuditFilters, page: number) => ['admin', 'audit', f, page] as const,
  health: ['admin', 'health'] as const,
}

const pageQuery = (page: number) => ({ page: page > 1 ? page : undefined, page_size: 20 })
const orUndef = (v: string) => v.trim() || undefined

export const fetchAdminUsers = (f: UserFilters, page: number, signal?: AbortSignal) =>
  api.get<Paginated<StaffUserRow>>('/admin/users/', {
    signal,
    query: {
      q: orUndef(f.q),
      role: orUndef(f.role),
      status: orUndef(f.status),
      ...pageQuery(page),
    },
  })

export const reactivateUser = (userId: Uuid, reason: string) =>
  api.post<StaffUserRow>(`/admin/users/${encodeURIComponent(userId)}/reactivate/`, { reason })

/** Step-up: la contraseña del admin se envía una vez y no se guarda. */
export const changeRole = (userId: Uuid, platform_role: string, reason: string, password: string) =>
  api.post<StaffUserRow>(`/admin/users/${encodeURIComponent(userId)}/role/`, {
    platform_role,
    reason,
    password,
  })

export interface PasswordResetLink {
  /** Token de un solo uso: se muestra una vez y no se guarda en el cliente. */
  token: string
  expires_at: IsoDateTime
  /** Ruta relativa de esta app, p. ej. `/restablecer-contrasena?token=...`. */
  reset_path: string
}

/** Enlace de restablecimiento (30 min) para entregar al usuario. Step-up del admin. */
export const issuePasswordReset = (userId: Uuid, reason: string, password: string) =>
  api.post<PasswordResetLink>(`/admin/users/${encodeURIComponent(userId)}/password-reset/`, {
    reason,
    password,
  })

/** Quita el doble factor de quien perdió el teléfono y sus códigos. Step-up del admin. */
export const resetUserMfa = (userId: Uuid, reason: string, password: string) =>
  api.post<void>(`/admin/users/${encodeURIComponent(userId)}/mfa-reset/`, { reason, password })

export const fetchAdminCategories = (signal?: AbortSignal) =>
  api.get<AdminCategory[]>('/admin/categories/', { signal })

export const createCategory = (name: string, slug: string) =>
  api.post<AdminCategory>('/admin/categories/', { name, slug })

export const updateCategory = (id: number, changes: { name?: string; is_active?: boolean }) =>
  api.patch<AdminCategory>(`/admin/categories/${id}/`, changes)

export const fetchAuditEvents = (f: AuditFilters, page: number, signal?: AbortSignal) =>
  api.get<Paginated<AuditRow>>('/admin/audit-events/', {
    signal,
    query: {
      auction_id: orUndef(f.auction_id),
      actor_id: orUndef(f.actor_id),
      action: orUndef(f.action),
      from: orUndef(f.from),
      to: orUndef(f.to),
      ...pageQuery(page),
    },
  })

export const fetchSystemHealth = (signal?: AbortSignal) =>
  api.get<SystemHealth>('/admin/system-health/', { signal })
