import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'

import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { fetchCategories, listingKeys } from '@/features/listings/api'

import { auctionKeys, fetchCatalog } from './api'
import { AuctionCard } from './AuctionCard'
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

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Subastas</h1>

      <div className="space-y-3 rounded-xl border p-4">
        <form onSubmit={onSearch} role="search" className="flex gap-2">
          <label className="sr-only" htmlFor="catalog-q">
            Buscar
          </label>
          <Input
            id="catalog-q"
            type="search"
            placeholder="Buscar por título…"
            value={q}
            maxLength={100}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
            aria-label="Modalidad"
            value={filters.mechanism}
            onChange={(e) => update({ mechanism: e.target.value || null })}
          >
            <option value="">Todas las modalidades</option>
            {MECHANISMS.map((m) => (
              <option key={m} value={m}>
                {MECHANISM_LABEL[m]}
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={!!filters.ending_soon}
              onChange={(e) => update({ ending_soon: e.target.checked ? 'true' : null })}
            />
            Terminan pronto
          </label>
        </div>
      </div>

      {catalog.isPending ? (
        <PageLoading />
      ) : catalog.isError ? (
        <ErrorAlert error={catalog.error} title="No se pudo cargar el catálogo" />
      ) : data && data.results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hay subastas con estos filtros.
        </p>
      ) : (
        data && (
          <>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {data.count} {data.count === 1 ? 'subasta' : 'subastas'}
            </p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">Página {page}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data.next}
                  onClick={() => update({ page: String(page + 1) })}
                >
                  Siguiente
                </Button>
              </nav>
            )}
          </>
        )
      )}
    </section>
  )
}
