/**
 * Valida el parámetro `?next=` para volver tras el login sin permitir redirecciones
 * abiertas a otros sitios (`//evil.com`, `https://...`, `javascript:`).
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  if (hasControlChars(raw) || raw.includes('://')) return fallback
  if (raw.startsWith('/ingresar') || raw.startsWith('/registro')) return fallback
  return raw
}

export function loginPathFor(current: string): string {
  const next = safeNextPath(current, '')
  return next ? `/ingresar?next=${encodeURIComponent(next)}` : '/ingresar'
}

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) < 0x20 || value.charCodeAt(i) === 0x7f) return true
  }
  return false
}
