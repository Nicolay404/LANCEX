import type { ReactNode } from 'react'

import { Logo } from '@/components/Logo'

const BENEFITS = [
  {
    icon: 'M13 2 3 14h9l-1 8 10-12h-9z',
    text: 'Puja en vivo o deja que la puja automática lo haga por ti.',
  },
  {
    icon: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
    text: 'Ofertas selladas que nadie ve hasta el cierre.',
  },
  {
    icon: 'M12 3c1.5 2 2 3 0 5-2-2-1.5-3 0-5zM9 10h6v11H9zM7 21h10',
    text: 'Cierres por vela que puedes verificar tú mismo.',
  },
]

/** Ingreso y registro: panel de marca oscuro a la izquierda (escritorio) y formulario a la derecha. */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-3xl border border-primary/30 shadow-2xl shadow-primary/10 lg:grid lg:grid-cols-2">
      {/* Panel izquierdo: marca premium */}
      <aside className="relative hidden flex-col justify-between gap-8 overflow-hidden border-r border-primary/30 bg-gradient-to-br from-[#0b1a45] via-[#0d0d0d] to-[#0a1a45] p-10 text-white lg:flex">
        <div aria-hidden className="grid-surface absolute inset-0" />
        <div
          aria-hidden
          className="absolute -top-24 -right-24 size-72 rounded-full bg-primary/30 blur-3xl"
        />

        {/* Contenido */}
        <div className="relative space-y-5">
          <Logo />
          <div className="space-y-3">
            <p className="text-3xl leading-tight font-extrabold">
              Tu próxima gran <span className="accent-word">oportunidad</span> está en subasta.
            </p>
            <p className="text-sm leading-relaxed text-white/70">
              Únete a LANCEX y participa con reglas claras desde el primer minuto.
            </p>
          </div>
        </div>

        <ul className="relative space-y-4">
          {BENEFITS.map((b) => (
            <li key={b.text} className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-link ring-1 ring-primary/40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={b.icon} />
                </svg>
              </span>
              <span className="text-sm leading-relaxed text-white/75">{b.text}</span>
            </li>
          ))}
        </ul>

        {/* Línea decorativa inferior */}
        <div className="relative h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </aside>

      {/* Panel derecho: formulario */}
      <section className="space-y-6 bg-card p-8 sm:p-10">
        <div className="space-y-1.5">
          <div className="lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>

        {children}

        {footer && (
          <div className="border-t border-border/60 pt-4 text-sm text-muted-foreground">
            {footer}
          </div>
        )}
      </section>
    </div>
  )
}
