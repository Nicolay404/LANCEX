import type { ReactNode } from 'react'

import { Logo } from '@/components/Logo'

const BENEFITS = [
  { icon: '⚡', text: 'Puja en vivo o deja que la puja automática lo haga por ti.' },
  { icon: '🔒', text: 'Ofertas selladas que nadie ve hasta el cierre.' },
  { icon: '🕯️', text: 'Cierres por vela que puedes verificar tú mismo.' },
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
    <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-3xl border border-white/[0.06] shadow-2xl shadow-black/40 lg:grid lg:grid-cols-2">

      {/* Panel izquierdo: marca premium */}
      <aside
        className="relative hidden flex-col justify-between gap-8 overflow-hidden p-10 text-white lg:flex"
        style={{
          background: `
            radial-gradient(ellipse 100% 80% at 0% 0%, oklch(0.42 0.10 145 / 40%) 0%, transparent 60%),
            radial-gradient(ellipse 80% 60% at 100% 100%, oklch(0.72 0.18 55 / 25%) 0%, transparent 60%),
            linear-gradient(160deg, oklch(0.12 0.015 265) 0%, oklch(0.10 0.008 265) 100%)
          `,
        }}
      >
        {/* Grid decorativo */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: `
              linear-gradient(oklch(1 0 0) 1px, transparent 1px),
              linear-gradient(90deg, oklch(1 0 0) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />

        {/* Glow dorado esquina superior derecha */}
        <div
          className="pointer-events-none absolute -top-20 -right-20 size-64 rounded-full"
          style={{
            background: 'radial-gradient(circle, oklch(0.72 0.18 55 / 30%) 0%, transparent 70%)',
            filter: 'blur(32px)',
          }}
        />

        {/* Glow verde esquina inferior izquierda */}
        <div
          className="pointer-events-none absolute -bottom-16 -left-16 size-56 rounded-full"
          style={{
            background: 'radial-gradient(circle, oklch(0.45 0.11 145 / 25%) 0%, transparent 70%)',
            filter: 'blur(28px)',
          }}
        />

        {/* Contenido */}
        <div className="relative space-y-5">
          <Logo inverted />
          <div className="space-y-3">
            <p className="text-3xl leading-tight font-extrabold">
              Tu próxima gran{' '}
              <span
                className="accent-word"
                style={{
                  background: 'linear-gradient(135deg, oklch(0.85 0.18 65) 0%, oklch(0.72 0.18 52) 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                oportunidad
              </span>{' '}
              está en subasta.
            </p>
            <p className="text-sm text-white/55 leading-relaxed">
              Únete a LANCEX y participa con reglas claras desde el primer minuto.
            </p>
          </div>
        </div>

        <ul className="relative space-y-4">
          {BENEFITS.map((b) => (
            <li key={b.text} className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/8 text-base backdrop-blur"
              >
                {b.icon}
              </span>
              <span className="text-sm text-white/65 leading-relaxed">{b.text}</span>
            </li>
          ))}
        </ul>

        {/* Línea decorativa inferior */}
        <div className="relative h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </aside>

      {/* Panel derecho: formulario */}
      <section
        className="space-y-6 p-8 sm:p-10"
        style={{ background: 'var(--card)' }}
      >
        {/* Línea decorativa dorada superior (solo móvil) */}
        <div className="h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent lg:hidden" />

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
