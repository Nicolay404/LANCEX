import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'

import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Button } from '@/components/ui/button'
import { MECHANISM_LABEL } from '@/features/auctions/labels'
import type { Mechanism } from '@/features/auctions/types'
import { Cap, hasCapability } from '@/features/auth/capabilities'
import { useMe } from '@/features/auth/session'
import { fetchMyListings, listingKeys } from '@/features/listings/api'
import { ITEM_CONDITION_LABEL, type OwnListingRow } from '@/features/listings/types'
import { formatDateTime } from '@/lib/dates'

/** `/mis-publicaciones` (paquete `listings`, capacidad `listing.manage_own`): `GET /listings/`. */
export default function MyListingsPage() {
  const [page, setPage] = useState(1)
  const list = useQuery({
    queryKey: listingKeys.mine(page),
    queryFn: ({ signal }) => fetchMyListings(page, signal),
    placeholderData: keepPreviousData,
  })

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Mis publicaciones</h1>
        <Button asChild>
          <Link to="/mis-publicaciones/nueva">Nueva publicación</Link>
        </Button>
      </header>
      {list.isPending ? (
        <PageLoading />
      ) : list.isError ? (
        <ErrorAlert error={list.error} />
      ) : list.data.results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Todavía no tienes publicaciones. Crea una para poder subastarla.
        </p>
      ) : (
        <>
          <ul className="divide-y rounded-xl border">
            {list.data.results.map((l) => (
              <ListingRow key={l.id} listing={l} />
            ))}
          </ul>
          {(list.data.previous || list.data.next) && (
            <nav aria-label="Páginas" className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={!list.data.previous}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">Página {page}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!list.data.next}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  )
}

function ListingRow({ listing: l }: { listing: OwnListingRow }) {
  const me = useMe()
  const canAuction = hasCapability(me, Cap.AUCTION_CREATE_PERSONAL)
  return (
    <li className="flex flex-wrap items-center gap-4 p-3">
      {l.cover_image_url ? (
        <img
          src={l.cover_image_url}
          alt=""
          className="size-16 shrink-0 rounded-md border object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div
          aria-hidden
          className="flex size-16 shrink-0 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground"
        >
          Sin foto
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        <Link
          to={`/mis-publicaciones/${l.id}/editar`}
          className="block truncate font-medium underline-offset-2 hover:underline"
        >
          {l.title}
        </Link>
        <p className="text-xs text-muted-foreground">
          {[l.category.name, ITEM_CONDITION_LABEL[l.item_condition], l.location_city]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="text-xs text-muted-foreground">
          {l.latest_auction ? (
            <>
              {/* El estado guardado puede no ser el efectivo: se enlaza al detalle. */}
              Última subasta:{' '}
              <Link
                to={`/subastas/${l.latest_auction.id}`}
                className="underline underline-offset-2"
              >
                {MECHANISM_LABEL[l.latest_auction.mechanism as Mechanism] ??
                  l.latest_auction.mechanism}
              </Link>
            </>
          ) : (
            'Sin subasta'
          )}
          {' · actualizada '}
          {formatDateTime(l.updated_at)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {l.editable ? (
          <>
            <Button asChild variant="outline" size="sm">
              <Link to={`/mis-publicaciones/${l.id}/editar`}>Editar</Link>
            </Button>
            {canAuction && (
              <Button asChild size="sm">
                <Link to={`/mis-subastas/nueva?listing=${l.id}`}>Crear subasta</Link>
              </Button>
            )}
          </>
        ) : (
          <>
            <span className="text-xs text-muted-foreground" title="Tiene una subasta abierta">
              En subasta: no editable
            </span>
            {/* Solo lectura: la página de edición bloquea el formulario y las imágenes. */}
            <Button asChild variant="ghost" size="sm">
              <Link to={`/mis-publicaciones/${l.id}/editar`}>Ver</Link>
            </Button>
          </>
        )}
      </div>
    </li>
  )
}
