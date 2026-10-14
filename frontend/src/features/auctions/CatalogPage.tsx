import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'

import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import { fetchCategories, listingKeys } from '@/features/listings/api'

import { auctionKeys, fetchCatalog } from './api'
import { AuctionCard } from './AuctionCard'
import { Hero } from './Hero'
import { HomeShowcase } from './HomeShowcase'
import { MECHANISM_LABEL, STATUS_LABEL } from './labels'
import type { AuctionStatus, CatalogFilters, Mechanism } from './types'

const STATUSES: AuctionStatus[] = ['active', 'scheduled', 'closed', 'cancelled']
const MECHANISMS: Mechanism[] = ['ascending', 'sealed', 'reverse']
const ORDERINGS = {
  ends_at: 'Terminan antes',
  '-created_at': 'Más recientes',
  current_price: 'Menor precio',
} as const
type Ordering = keyof typeof ORDERINGS

/** Lee los filtros de la URL (compartibles; nada en localStorage). */
function filtersFrom(params: URLSearchParams): CatalogFilters {
  const ordering = params.get('ordering')
  const page = Number(params.get('page'))
  return {
    q: params.get('q') ?? '',
    category: params.get('category') ?? '',
    mechanism: (MECHANISMS as string[]).includes(params.get('mechanism') ?? '')
      ? (params.get('mechanism') as Mechanism)
      : '',
    status: (STATUSES as string[]).includes(params.get('status') ?? '')
      ? (params.get('status') as AuctionStatus)
      : '',
    ending_soon: params.get('ending_soon') === 'true',
    ordering: ordering && ordering in ORDERINGS ? (ordering as Ordering) : 'ends_at',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/** `/`: catálogo público (LX-27). Polling cada 15 s solo con la pestaña visible (ADR-0004). */
export function CatalogPage() {
  const [params, setParams] = useSearchParams()
  const filters = filtersFrom(params)
  const [q, setQ] = useState(filters.q ?? '')

  const catalog = useQuery({
    queryKey: auctionKeys.catalog(filters),
    queryFn: ({ signal }) => fetchCatalog(filters, signal),
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
  })
  const categories = useQuery({
    queryKey: listingKeys.categories,
    queryFn: ({ signal }) => fetchCategories(signal),
    staleTime: 5 * 60_000,
  })

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }
  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    update({ q: q.trim() || null })
  }

  const data = catalog.data
  const page = filters.page ?? 1
  const isFiltered = params.toString() !== ''

  return (
    <div className="space-y-16">
      {!isFiltered && (
        <>
          <Hero />
          <HomeShowcase />
        </>
      )}

      <section className="space-y-6" aria-labelledby="catalog-title">
        {/* Encabezado de sección */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              <span aria-hidden className="size-1.5 rounded-full bg-primary" />
              Catálogo completo
            </p>
            <h2 id="catalog-title" className="text-3xl font-extrabold text-white">
              Subastas
              {data && (
                <span className="ml-3 text-xl font-medium text-muted-foreground">
                  ({data.count})
                </span>
              )}
            </h2>
          </div>

          {/* Buscador */}
          <form onSubmit={onSearch} role="search" className="flex w-full max-w-sm gap-2">
            <label className="sr-only" htmlFor="catalog-q">
              Buscar
            </label>
            <div className="relative flex-1">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <Input
                id="catalog-q"
                type="search"
                placeholder="Buscar subastas…"
                value={q}
                maxLength={100}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit">Buscar</Button>
          </form>
        </div>

        {/* Chips de mecanismo */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Modalidad">
          {(['', ...MECHANISMS] as const).map((m) => {
            const active = filters.mechanism === m
            return (
              <button
                key={m || 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => update({ mechanism: m || null })}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold transition-all duration-200',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                    : 'border-white/12 bg-card text-white/70 hover:border-primary/50 hover:text-white',
                )}
              >
                {m ? MECHANISM_LABEL[m] : 'Todas'}
              </button>
            )
          })}
        </div>

        {/* Filtros secundarios */}
        <div className="grid gap-3 rounded-2xl border border-white/[0.08] bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
          <NativeSelect
            aria-label="Categoría"
            value={filters.category}
            onChange={(e) => update({ category: e.target.value || null })}
          >
            <option value="">Todas las categorías</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Estado"
            value={filters.status}
            onChange={(e) => update({ status: e.target.value || null })}
          >
            <option value="">Todos los estados</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Ordenar"
            value={filters.ordering}
            onChange={(e) =>
              update({ ordering: e.target.value === 'ends_at' ? null : e.target.value })
            }
          >
            {Object.entries(ORDERINGS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <label className="flex items-center gap-2 px-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)] rounded"
              checked={!!filters.ending_soon}
              onChange={(e) => update({ ending_soon: e.target.checked ? 'true' : null })}
            />
            <span>Terminan pronto</span>
          </label>
        </div>

        {/* Resultados */}
        {catalog.isPending ? (
          <PageLoading />
        ) : catalog.isError ? (
          <ErrorAlert error={catalog.error} title="No se pudo cargar el catálogo" />
        ) : data && data.results.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border/60 bg-card/40 p-16 text-center">
            <p className="text-sm text-muted-foreground">No hay subastas con estos filtros.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQ('')
                setParams(new URLSearchParams(), { replace: true })
              }}
            >
              Limpiar filtros
            </Button>
          </div>
        ) : (
          data && (
            <>
              <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
                {data.count} {data.count === 1 ? 'subasta encontrada' : 'subastas encontradas'}
              </p>
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-6">
                {data.results.map((a) => (
                  <AuctionCard key={a.id} auction={a} />
                ))}
              </ul>
              {(data.previous || data.next) && (
                <nav aria-label="Páginas" className="flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!data.previous}
                    onClick={() => update({ page: page > 2 ? String(page - 1) : null })}
                  >
                    ← Anterior
                  </Button>
                  <span className="rounded-lg border border-border/60 bg-card px-4 py-1.5 text-sm font-semibold">
                    Página {page}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!data.next}
                    onClick={() => update({ page: String(page + 1) })}
                  >
                    Siguiente →
                  </Button>
                </nav>
              )}
            </>
          )
        )}
      </section>
    </div>
  )
}
