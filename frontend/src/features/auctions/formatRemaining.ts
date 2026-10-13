export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (d > 0) return `${d} d ${h} h ${m} min`
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min ${String(s).padStart(2, '0')} s`
  return `${m} min ${String(s).padStart(2, '0')} s`
}
