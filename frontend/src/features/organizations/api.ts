import { api } from '@/api/client'
import type { Uuid } from '@/api/types'

import type { Organization, OrganizationInput } from './types'

const base = (id: Uuid) => `/organizations/${encodeURIComponent(id)}/`

export const orgKeys = {
  detail: (id: Uuid) => ['organizations', id] as const,
}

export const createOrganization = (input: OrganizationInput) =>
  api.post<Organization>('/organizations/', input)

export const fetchOrganization = (id: Uuid, signal?: AbortSignal) =>
  api.get<Organization>(base(id), { signal })

export const updateOrganization = (id: Uuid, changes: Partial<OrganizationInput>) =>
  api.patch<Organization>(base(id), changes)

export const addMember = (id: Uuid, email: string) =>
  api.post<Organization>(`${base(id)}members/`, { email })

export const removeMember = (id: Uuid, userId: Uuid) =>
  api.delete<void>(`${base(id)}members/${encodeURIComponent(userId)}/`)

/** Step-up: el backend exige la contraseña actual (`STEP_UP_FAILED` si no coincide). */
export const transferOwnership = (id: Uuid, newOwnerUserId: Uuid, password: string) =>
  api.post<Organization>(`${base(id)}transfer-ownership/`, {
    new_owner_user_id: newOwnerUserId,
    password,
  })
