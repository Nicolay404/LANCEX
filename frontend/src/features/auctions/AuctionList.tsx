import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'

import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { auctionKeys, fetchCatalog } from './api'
import { AuctionCard } from './AuctionCard'
import type { AuctionStatus, AuctionSummary, CatalogFilters } from './types'

export interface StatusTab {
  label: string
  status: AuctionStatus | ''
}

/**
 * Lista de subastas del usuario (`mine=owner|participating`) con pestañas por estado.
 * La pestaña vive en la URL (`?estado=`), no en localStorage.
 */
export function AuctionList({
  mine,
  tabs,
  empty,
  linkFor,
}: {
  mine: NonNullable<CatalogFilters['mine']>
  tabs: StatusTab[]
  empty: string
  linkFor?: (a: AuctionSummary) => string | undefined
}) {
  const [params, setParams] = useSearchParams()
  const current = tabs.find((t) => t.status === (params.get('estado') ?? '')) ?? tabs[0]!
  const page = Math.max(1, Number(params.get('page')) || 1)
  const filters: CatalogFilters = {
    mine,
    status: current.status,
    ordering: '-created_at',
    page,
  }
  const list = useQuery({
    queryKey: auctionKeys.catalog(filters),
    queryFn: ({ signal }) => fetchCatalog(filters, signal),
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
  })
  const go = (estado: string, p = 1) => {
    const next = new URLSearchParams()
    if (estado) next.set('estado', estado)
    if (p > 1) next.set('page', String(p))
    setParams(next, { replace: true })
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Estado" className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.label}
            role="tab"
            type="button"
            aria-selected={t === current}
            onClick={() => go(t.status)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              t === current
                ? 'border-foreground font-medium'
                : 'border-transparent text-muted-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {list.isPending ? (
        <PageLoading />
      ) : list.isError ? (
        <ErrorAlert error={list.error} />
      ) : list.data.results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.data.results.map((a) => (
              <AuctionCard key={a.id} auction={a} to={linkFor?.(a)} />
            ))}
          </ul>
          {(list.data.previous || list.data.next) && (
            <nav aria-label="Páginas" className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={!list.data.previous}
                onClick={() => go(current.status, page - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">Página {page}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!list.data.next}
                onClick={() => go(current.status, page + 1)}
              >
                Siguiente
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
