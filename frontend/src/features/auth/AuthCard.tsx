import type { ReactNode } from 'react'

export function AuthCard({
  title,
  children,
  footer,
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <section className="mx-auto w-full max-w-sm space-y-6 rounded-xl border bg-card p-6 shadow-xs">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {children}
      {footer && <div className="text-sm text-muted-foreground">{footer}</div>}
    </section>
  )
}
