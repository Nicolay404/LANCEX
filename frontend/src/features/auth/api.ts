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

/** Con 2FA el primer paso NO inicia sesión: responde `{mfa_required: true}`. */
export interface MfaRequired {
  mfa_required: true
}

export const isMfaRequired = (r: UserMe | MfaRequired): r is MfaRequired =>
  'mfa_required' in r && r.mfa_required === true

export const login = (input: LoginInput) => api.post<UserMe | MfaRequired>('/auth/login/', input)

/** Segundo paso: código de 6 dígitos de la app o código de respaldo `XXXX-XXXX-XXXX-XXXX`. */
export const loginMfa = (code: string) => api.post<UserMe>('/auth/login/mfa/', { code })

/** Restablecimiento con el enlace de un solo uso que generó un admin (sin sesión). */
export const confirmPasswordReset = (token: string, new_password: string) =>
  api.post<void>('/auth/password-reset/', { token, new_password })

// --- Doble factor de mi cuenta ---------------------------------------------------------

export interface MfaStatus {
  enabled: boolean
  enabled_at: string | null
  recovery_codes_remaining: number
}

export interface MfaSetup {
  /** Clave base32 para escribirla a mano en la app. Vive solo en memoria, nunca en storage. */
  secret: string
  otpauth_uri: string
}

export const fetchMfaStatus = (signal?: AbortSignal) => api.get<MfaStatus>('/auth/mfa/', { signal })

export const startMfaSetup = (password: string) =>
  api.post<MfaSetup>('/auth/mfa/setup/', { password })

export const enableMfa = (code: string) =>
  api.post<{ recovery_codes: string[] }>('/auth/mfa/enable/', { code })

export const disableMfa = (password: string, code: string) =>
  api.post<void>('/auth/mfa/disable/', { password, code })

export const regenerateRecoveryCodes = (password: string, code: string) =>
  api.post<{ recovery_codes: string[] }>('/auth/mfa/recovery-codes/', { password, code })

export const register = (input: RegisterInput) => api.post<UserMe>('/auth/register/', input)

export const logoutRequest = () => api.post<void>('/auth/logout/')

export interface ProfileInput {
  display_name?: string
  bio?: string | null
  location_city?: string | null
}

/** PATCH parcial del perfil: solo los campos cambiados (`null` borra bio o ciudad). */
export const updateProfile = (changes: ProfileInput) => api.patch<UserMe>('/auth/me/', changes)

export const changePassword = (input: PasswordChangeInput) =>
  api.post<void>('/auth/password/', input)
