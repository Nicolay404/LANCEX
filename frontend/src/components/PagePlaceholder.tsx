import type { ReactNode } from 'react'

/** Esqueleto de una pantalla cuyo contenido llega en una tarea posterior. */
export function PagePlaceholder({
  title,
  task,
  children,
}: {
  title: string
  task: string
  children?: ReactNode
}) {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Pantalla en construcción ({task}).
      </p>
    </section>
  )
}
