import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { Cap, hasCapability } from '@/features/auth/capabilities'
import { useMe } from '@/features/auth/session'

const TILES = [
  {
    cls: 'from-[oklch(0.62_0.15_55)] to-[oklch(0.42_0.10_48)]',
    icon: 'M14 13l-7.5 7.5a2.12 2.12 0 0 1-3-3L11 10M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8',
    label: 'Ascendente',
    emoji: '📈',
  },
  {
    cls: 'from-[oklch(0.42_0.10_145)] to-[oklch(0.28_0.07_155)]',
    icon: 'M3 7l9 6 9-6M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2',
    label: 'Sobre cerrado',
    emoji: '🔒',
  },
  {
    cls: 'from-[oklch(0.35_0.06_265)] to-[oklch(0.22_0.04_270)]',
    icon: 'M12 3c1.5 2 2 3 0 5-2-2-1.5-3 0-5zM9 10h6v11H9zM7 21h10',
    label: 'Vela',
    emoji: '🕯️',
  },
]

const STATS = [
  { value: '4', label: 'Modalidades', unit: '' },
  { value: '100', label: 'Tiempo real', unit: '%' },
  { value: '0', label: 'Comisiones', unit: '%' },
]

/** Portada del catálogo: superficie premium oscura con acentos dorados. */
export function Hero() {
  const me = useMe()
  const sell = !me
    ? '/registro'
    : hasCapability(me, Cap.LISTING_MANAGE_OWN)
      ? '/mis-publicaciones/nueva'
      : null
  return (
    <section className="relative overflow-hidden rounded-3xl">
      {/* Fondo con gradiente profundo oscuro */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 20% 50%, oklch(0.42 0.10 145 / 35%) 0%, transparent 60%),
            radial-gradient(ellipse 50% 80% at 80% 20%, oklch(0.72 0.18 55 / 20%) 0%, transparent 50%),
            linear-gradient(135deg, oklch(0.12 0.015 265) 0%, oklch(0.10 0.008 265) 100%)
          `,
        }}
      />

      {/* Grid decorativo de fondo */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(oklch(1 0 0) 1px, transparent 1px),
            linear-gradient(90deg, oklch(1 0 0) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />

      {/* Círculo decorativo glow */}
      <div
        className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full opacity-20"
        style={{
          background: 'radial-gradient(circle, oklch(0.72 0.18 55) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-24 size-80 rounded-full opacity-15"
        style={{
          background: 'radial-gradient(circle, oklch(0.45 0.11 145) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      <div className="relative grid items-center gap-10 px-6 py-14 sm:px-12 lg:grid-cols-[1.15fr_1fr] lg:py-20">
        {/* Contenido principal */}
        <div className="space-y-7">
          {/* Badge "En vivo" */}
          <div className="inline-flex">
            <span className="live-badge relative inline-flex items-center gap-2.5 rounded-full border border-live/30 bg-live/10 px-4 py-1.5 text-xs font-bold tracking-widest text-live uppercase">
              <span aria-hidden className="size-2 animate-pulse rounded-full bg-live" />
              Subastas en tiempo real
            </span>
          </div>

          {/* Título principal */}
          <h1 className="text-4xl leading-[1.1] font-extrabold sm:text-5xl lg:text-6xl text-white">
            Encuentra tu próxima{' '}
            <span
              className="accent-word"
              style={{
                background: 'linear-gradient(135deg, oklch(0.85 0.18 65) 0%, oklch(0.72 0.18 52) 60%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              subasta
            </span>{' '}
            al mejor precio.
          </h1>

          {/* Subtítulo */}
          <p className="max-w-lg text-base leading-relaxed text-white/60">
            Puja en vivo, envía ofertas selladas o compra para tu empresa a la baja.{' '}
            <span className="text-white/80">Reglas claras</span>, cuentas regresivas con la hora
            del servidor y cierres verificables.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40 hover:-translate-y-0.5"
            >
              <Link to="/?status=active">
                <span aria-hidden className="mr-1">⚡</span>
                Ver subastas en vivo
              </Link>
            </Button>
            {sell && (
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/15 bg-white/5 text-white backdrop-blur hover:border-white/30 hover:bg-white/10 hover:text-white"
              >
                <Link to={sell}>Vender un artículo</Link>
              </Button>
            )}
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap gap-8 pt-1">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-extrabold tabular-nums text-white">
                  {s.value}
                  <span className="text-primary">{s.unit}</span>
                </p>
                <p className="mt-0.5 text-xs text-white/45 font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Mosaico de modalidades */}
        <div aria-hidden className="hidden h-80 grid-cols-2 grid-rows-2 gap-3.5 lg:grid">
          {TILES.map((t, i) => (
            <div
              key={t.label}
              className={`shimmer-hover relative flex flex-col items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br shadow-2xl ring-1 ring-white/10 transition-transform duration-300 hover:scale-[1.02] ${t.cls} ${i === 0 ? 'row-span-2' : ''}`}
            >
              {/* Glow corner */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              <svg
                viewBox="0 0 24 24"
                className="relative size-16 text-white/60 transition-transform duration-300"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={t.icon} />
              </svg>
              <span className="relative mt-2 text-lg">{t.emoji}</span>
              <span className="absolute bottom-3 left-3 rounded-full border border-white/15 bg-black/40 px-2.5 py-0.5 text-xs font-semibold text-white backdrop-blur">
                {t.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
