/**
 * Errores tipados de la API (CONTRATO-API-INICIAL.md §Errores).
 * El backend siempre responde `{ code, message, details, request_id }`.
 */

/** Códigos documentados en el contrato v1. */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_AMOUNT_PRECISION',
  'UNKNOWN_FIELD',
  'MECHANISM_COMBINATION_NOT_ALLOWED',
  'AUTH_REQUIRED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'CSRF_FAILED',
  'BID_ON_OWN_AUCTION',
  'NOT_ADMITTED',
  'ORGANIZATION_NOT_VERIFIED',
  'CONFLICT_OF_INTEREST',
  'ACCOUNT_SUSPENDED',
  'STEP_UP_FAILED',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'NOT_ACCEPTABLE',
  'UNSUPPORTED_MEDIA_TYPE',
  'AUCTION_NOT_ACTIVE',
  'BID_BELOW_MINIMUM',
  'OFFER_ABOVE_MAXIMUM',
  'ALREADY_LEADING',
  'PROXY_LIMIT_DECREASE_NOT_ALLOWED',
  'PROXY_NOT_ENABLED',
  'RULES_LOCKED',
  'LISTING_LOCKED',
  'LISTING_HAS_OPEN_AUCTION',
  'INVALID_STATE_TRANSITION',
  'IDEMPOTENCY_CONFLICT',
  'LIMIT_REACHED',
  'ALREADY_REPORTED',
  'LAST_OWNER',
  'LAST_ADMIN',
  'EMAIL_ALREADY_REGISTERED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  // Códigos agregados al contrato en las fases 4 a 7 (handoffs de backend).
  'MECHANISM_MISMATCH',
  'NOT_REVEALED_YET',
  'RUC_ALREADY_REGISTERED',
  'ALREADY_MEMBER',
  'ALREADY_REGISTERED',
  'PROCUREMENT_HAS_AUCTION',
  'ALREADY_RATED',
  'OPEN_ACTIVITY',
  'SLUG_ALREADY_EXISTS',
  'STORAGE_UNAVAILABLE',
  // Doble factor (2026-10-14). Deben estar aquí: un 401 desconocido se trataría como
  // AUTH_REQUIRED (sesión expirada) y sacaría al usuario en vez de decirle "código incorrecto".
  'INVALID_MFA_CODE',
  'MFA_SESSION_EXPIRED',
  'MFA_ALREADY_ENABLED',
  'MFA_NOT_ENABLED',
  'MFA_SETUP_REQUIRED',
] as const

/** Códigos que genera el propio cliente cuando no hay respuesta válida del servidor. */
export const CLIENT_ERROR_CODES = ['NETWORK_ERROR', 'INVALID_RESPONSE'] as const

export type ContractErrorCode = (typeof API_ERROR_CODES)[number]
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number]
export type ApiErrorCode = ContractErrorCode | ClientErrorCode

export type ErrorDetails = Record<string, unknown>

export interface ApiErrorBody {
  code: string
  message: string
  details: ErrorDetails
  request_id: string | null
}

const KNOWN_CODES: ReadonlySet<string> = new Set<string>([
  ...API_ERROR_CODES,
  ...CLIENT_ERROR_CODES,
])

export function isKnownErrorCode(code: string): code is ApiErrorCode {
  return KNOWN_CODES.has(code)
}

export class ApiError extends Error {
  readonly status: number
  /** Código estable del contrato. Si el backend envía uno desconocido se conserva tal cual en `rawCode`. */
  readonly code: ApiErrorCode
  readonly rawCode: string
  readonly details: ErrorDetails
  readonly requestId: string | null

  constructor(args: {
    status: number
    code: string
    message: string
    details?: ErrorDetails
    requestId?: string | null
  }) {
    super(args.message)
    this.name = 'ApiError'
    this.status = args.status
    this.rawCode = args.code
    this.code = isKnownErrorCode(args.code) ? args.code : fallbackCode(args.status)
    this.details = args.details ?? {}
    this.requestId = args.requestId ?? null
  }

  is<C extends ApiErrorCode>(code: C): this is ApiError & { code: C } {
    return this.code === code
  }

  /** Errores de validación por campo (`details.fields`), si los hay. */
  get fieldErrors(): Record<string, unknown> | null {
    const fields = this.details['fields']
    return fields !== null && typeof fields === 'object' && !Array.isArray(fields)
      ? (fields as Record<string, unknown>)
      : null
  }
}

/** Código razonable cuando la respuesta no trae uno del contrato. */
export function fallbackCode(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR'
    case 401:
      return 'AUTH_REQUIRED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 405:
      return 'METHOD_NOT_ALLOWED'
    case 406:
      return 'NOT_ACCEPTABLE'
    case 415:
      return 'UNSUPPORTED_MEDIA_TYPE'
    case 429:
      return 'RATE_LIMITED'
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_RESPONSE'
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

/** Valida que un JSON tenga la forma de error del contrato. */
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v['code'] === 'string' && typeof v['message'] === 'string'
}
