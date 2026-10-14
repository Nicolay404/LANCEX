import { Link } from 'react-router'

import { LogoMark } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { useMe } from '@/features/auth/session'

import { HERO_PHOTOS, unsplashUrl } from './categoryPhotos'
import { WelcomePanel } from './WelcomePanel'

const TILES = [
  { key: 'ascending', label: 'Ascendente' },
  { key: 'sealed', label: 'Sobre cerrado' },
  { key: 'candle', label: 'Cierre por vela' },
  { key: 'reverse', label: 'Inversa B2B' },
] as const

/** Portada del catálogo para visitantes; con sesión se muestra `WelcomePanel`. */
export function Hero() {
  const me = useMe()
  if (me) return <WelcomePanel me={me} />
  const sell = '/registro'
  return (
    <section className="relative overflow-hidden rounded-3xl border border-primary/50 bg-gradient-to-br from-[#0b1630] via-[#0d0d0d] to-[#0a1a45] shadow-2xl shadow-primary/10">
      <div aria-hidden className="grid-surface absolute inset-0" />
      <div
        aria-hidden
        className="absolute -top-40 -left-24 size-[28rem] rounded-full bg-primary/25 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -right-20 -bottom-40 size-[26rem] rounded-full bg-[#3d7bff]/20 blur-3xl"
      />

      <div className="relative grid items-center gap-10 px-6 py-12 sm:px-12 lg:grid-cols-[1.15fr_1fr] lg:py-16">
        <div className="space-y-7">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-white/80 uppercase">
            <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-live" />
            Subastas en tiempo real
          </p>
          <h1 className="text-4xl leading-[1.1] font-extrabold text-white sm:text-5xl">
            Descubre y puja en <span className="accent-word">subastas</span> exclusivas
          </h1>
          <p className="max-w-lg text-base text-white/75">
            Encuentra tecnología, arte, vehículos y objetos de colección. Puja en vivo, envía
            ofertas selladas o compra para tu empresa a la baja, con reglas claras y cierres
            verificables.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/?status=active">Ver subastas en vivo</Link>
            </Button>
            <Button asChild size="lg" variant="light">
              <Link to={sell}>Vender un artículo</Link>
            </Button>
          </div>
          <div className="space-y-2 pt-2">
            <p className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">
              Modalidades disponibles
            </p>
            <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm font-semibold text-white/60">
              {TILES.map((t) => (
                <li key={t.key}>{t.label}</li>
              ))}
            </ul>
          </div>
        </div>

        <div aria-hidden className="hidden grid-cols-2 gap-4 lg:grid">
          {HERO_PHOTOS.map((p) => (
            <div
              key={p.id}
              className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-primary/50 bg-card shadow-xl shadow-black/50"
            >
              <img
                src={unsplashUrl(p.id, 600)}
                alt=""
                referrerPolicy="no-referrer"
                className="size-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <span className="absolute bottom-2.5 left-2.5 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
                {p.label}
              </span>
              <LogoMark className="absolute right-2.5 bottom-2.5 h-4 w-auto opacity-80" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
