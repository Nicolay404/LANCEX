import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { fetchCategories, listingKeys } from '@/features/listings/api'
import { cn } from '@/lib/utils'

import { auctionKeys, fetchCatalog } from './api'
import { AuctionCard } from './AuctionCard'
import { photoForCategory } from './categoryPhotos'
import { CountdownChips } from './CountdownChips'
import { MECHANISM_LABEL } from './labels'
import { priceLines } from './PriceSummary'
import type { AuctionSummary, CatalogFilters } from './types'

const LIVE: CatalogFilters = { status: 'active', ordering: 'ends_at', page_size: 6 }

/** Secciones de la portada (solo sin filtros): en vivo, destacadas, categorías y cómo funciona. */
export function HomeShowcase() {
  const live = useQuery({
    queryKey: auctionKeys.catalog(LIVE),
    queryFn: ({ signal }) => fetchCatalog(LIVE, signal),
    refetchInterval: 15_000,
  })
  const items = live.data?.results ?? []
  const featured = items.slice(0, 2)
  const rest = items.slice(2, 6)

  return (
    <>
      {featured.length > 0 && (
        <section aria-labelledby="featured-title" className="space-y-6">
          <SectionHeader
            id="featured-title"
            eyebrow="Terminan pronto"
            title="Subastas destacadas"
            action={<SeeAll to="/?status=active" label="Ver todas en vivo" />}
          />
          <div className="grid gap-5 lg:grid-cols-2">
            {featured.map((a, i) => (
              <PromoBanner key={a.id} auction={a} variant={i === 0 ? 'blue' : 'gray'} />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section aria-labelledby="live-title" className="space-y-6">
          <SectionHeader id="live-title" eyebrow="Ahora mismo" title="Subastas en vivo" live />
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {rest.map((a) => (
              <AuctionCard key={a.id} auction={a} />
            ))}
          </ul>
        </section>
      )}

      <CategoryExplorer />
      <HowItWorks />
    </>
  )
}

function SectionHeader({
  id,
  eyebrow,
  title,
  live,
  action,
}: {
  id: string
  eyebrow: string
  title: string
  live?: boolean
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1.5">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          {eyebrow}
        </p>
        <h2 id={id} className="flex items-center gap-3 text-3xl font-extrabold text-white">
          {title}
          {live && (
            <span aria-hidden className="relative flex size-2.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative size-2.5 rounded-full bg-primary" />
            </span>
          )}
        </h2>
      </div>
      {action}
    </div>
  )
}

function SeeAll({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-link hover:text-white"
    >
      {label}
      <span aria-hidden>→</span>
    </Link>
  )
}

function PromoBanner({
  auction: a,
  variant,
}: {
  auction: AuctionSummary
  variant: 'blue' | 'gray'
}) {
  const price = priceLines(a)
  const cta =
    a.mechanism === 'sealed' ? 'Ofertar' : a.mechanism === 'reverse' ? 'Ver sala' : 'Pujar ahora'
  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-3xl border p-6 sm:p-8',
        variant === 'blue'
          ? 'border-primary/40 bg-gradient-to-br from-[#0a2a7a] via-[#0b1a45] to-[#0d0d0d]'
          : 'border-white/10 bg-gradient-to-br from-[#2a2a2a] via-[#1e1e1e] to-[#141414]',
      )}
    >
      <div aria-hidden className="grid-surface absolute inset-0" />
      {variant === 'gray' && (
        <div
          aria-hidden
          className="absolute -top-10 -right-24 h-[140%] w-40 rotate-[25deg] bg-primary/80 shadow-[0_0_60px_rgba(0,82,255,0.5)]"
        />
      )}
      <img
        src={photoForCategory(
          a.category?.name ?? (a.mechanism === 'reverse' ? 'insumos' : null),
          700,
        )}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="absolute top-1/2 right-5 hidden aspect-square w-[38%] -translate-y-1/2 rotate-3 rounded-2xl border border-white/15 object-cover shadow-2xl shadow-black/60 sm:block"
      />

      <div className="relative space-y-4 sm:max-w-[56%]">
        <p className="text-xs font-semibold tracking-wide text-white/60">
          {[a.category?.name, MECHANISM_LABEL[a.mechanism]].filter(Boolean).join(' · ')}
        </p>
        <h3 className="line-clamp-2 text-2xl leading-tight font-extrabold text-white sm:text-3xl">
          {a.title ?? 'Sin título'}
        </h3>
        <p className="text-sm text-white/70">
          {price.label}: <strong className="text-white">{price.value}</strong>
        </p>
        <CountdownChips
          target={a.ends_at}
          prefix="Termina en"
          elapsedLabel="Cerrando…"
          surface="plain"
          className="text-white/80"
        />
        <Button asChild>
          <Link to={`/subastas/${a.id}`}>
            {cta}
            <span className="sr-only">: {a.title ?? 'Sin título'}</span>
          </Link>
        </Button>
      </div>
    </article>
  )
}

function CategoryExplorer() {
  const categories = useQuery({
    queryKey: listingKeys.categories,
    queryFn: ({ signal }) => fetchCategories(signal),
    staleTime: 5 * 60_000,
  })
  const list = categories.data ?? []
  const [picked, setPicked] = useState<string | null>(null)
  const selected = picked ?? (list[0] ? String(list[0].id) : null)
  const filters: CatalogFilters = {
    status: 'active',
    category: selected ?? '',
    ordering: 'ends_at',
    page_size: 4,
  }
  const results = useQuery({
    queryKey: auctionKeys.catalog(filters),
    queryFn: ({ signal }) => fetchCatalog(filters, signal),
    enabled: selected !== null,
  })
  if (list.length === 0) return null

  return (
    <section aria-labelledby="by-category-title" className="space-y-6">
      <SectionHeader
        id="by-category-title"
        eyebrow="Explora"
        title="En vivo por categoría"
        action={
          selected && (
            <SeeAll to={`/?category=${selected}&status=active`} label="Ver la categoría" />
          )
        }
      />
      <div role="group" aria-label="Elegir categoría" className="flex flex-wrap gap-2">
        {list.map((c) => {
          const active = String(c.id) === selected
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={active}
              onClick={() => setPicked(String(c.id))}
              className={cn(
                'rounded-full border px-5 py-2 text-sm font-semibold transition-colors',
                active
                  ? 'border-primary bg-primary/15 text-white'
                  : 'border-white/12 bg-card text-white/70 hover:border-primary/50 hover:text-white',
              )}
            >
              {c.name}
            </button>
          )
        })}
      </div>
      {results.data && results.data.results.length > 0 ? (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {results.data.results.map((a) => (
            <AuctionCard key={a.id} auction={a} />
          ))}
        </ul>
      ) : (
        results.isSuccess && (
          <p className="rounded-2xl border border-dashed border-white/10 bg-card/50 p-8 text-center text-sm text-muted-foreground">
            No hay subastas en vivo en esta categoría ahora mismo.
          </p>
        )
      )}
    </section>
  )
}

const STEPS = [
  {
    title: 'Crea tu cuenta',
    text: 'Regístrate gratis y verifica tu correo. Si compras para una empresa, crea tu organización.',
    icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6',
  },
  {
    title: 'Puja u oferta',
    text: 'Puja en vivo (con puja automática), envía una oferta sellada o participa en la inversa B2B.',
    icon: 'M14 13l-7.5 7.5a2.12 2.12 0 0 1-3-3L11 10M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8',
  },
  {
    title: 'Gana y coordina',
    text: 'Al cierre ves el resultado verificable y coordinas pago y entrega directamente con la otra parte.',
    icon: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  },
]

function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="space-y-6">
      <SectionHeader id="how-title" eyebrow="Paso a paso" title="Cómo funciona" />
      <ol className="grid gap-5 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className="relative space-y-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-card p-6"
          >
            <span
              aria-hidden
              className="absolute -top-4 right-2 text-8xl font-extrabold text-white/[0.04]"
            >
              {i + 1}
            </span>
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/15 text-link ring-1 ring-primary/40">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={s.icon} />
              </svg>
            </span>
            <h3 className="text-lg font-bold text-white">
              <span className="sr-only">Paso {i + 1}: </span>
              {s.title}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
