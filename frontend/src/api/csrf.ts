/** Lectura de la cookie `csrftoken` que entrega `GET /auth/csrf/` (ADR-0004 §3). */

export const CSRF_COOKIE_NAME = 'csrftoken'
export const CSRF_HEADER_NAME = 'X-CSRFToken'

export function readCookie(name: string, cookieString: string = document.cookie): string | null {
  for (const part of cookieString.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=')
    if (rawKey === name) {
      const value = rest.join('=')
      return value ? decodeURIComponent(value) : null
    }
  }
  return null
}

export function getCsrfToken(): string | null {
  return readCookie(CSRF_COOKIE_NAME)
}
