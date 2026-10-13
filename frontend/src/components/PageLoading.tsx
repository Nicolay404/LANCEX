export function PageLoading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="py-10 text-center text-sm text-muted-foreground"
    >
      {label}
    </div>
  )
}
