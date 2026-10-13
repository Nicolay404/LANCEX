/** Endpoints de autenticación y cuenta (CONTRATO-API-INICIAL.md §Autenticación y cuenta). */
import { api } from '@/api/client'
import { ApiError } from '@/api/errors'
import type { UserMe } from '@/api/types'

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  email: string
  password: string
  display_name: string
}

export interface PasswordChangeInput {
  current_password: string
  new_password: string
}

/** `GET /auth/me/`. Sin sesión (`401 AUTH_REQUIRED`) devuelve `null` en vez de lanzar. */
export async function fetchMe(signal?: AbortSignal): Promise<UserMe | null> {
  try {
    return await api.get<UserMe>('/auth/me/', { signal })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export const login = (input: LoginInput) => api.post<UserMe>('/auth/login/', input)

export const register = (input: RegisterInput) => api.post<UserMe>('/auth/register/', input)

export const logoutRequest = () => api.post<void>('/auth/logout/')

/** Solo `display_name`: cualquier otro campo es `UNKNOWN_FIELD` en el backend. */
export const updateProfile = (display_name: string) =>
  api.patch<UserMe>('/auth/me/', { display_name })

export const changePassword = (input: PasswordChangeInput) =>
  api.post<void>('/auth/password/', input)
