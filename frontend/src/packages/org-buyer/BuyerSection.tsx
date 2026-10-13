import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useRoutes } from 'react-router'

import type { UserOrganization } from '@/api/types'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Button } from '@/components/ui/button'
import { AuctionList } from '@/features/auctions/AuctionList'
import { fetchOrganizationNeeds, reverseKeys } from '@/features/reverse/api'
import { formatDate, formatQuantity } from '@/features/reverse/format'

import { NeedPage } from './NeedPage'
import { NewNeedPage } from './NewNeedPage'
import { QualificationPage } from './QualificationPage'

/**
 * Paquete `org-buyer` (LX-53): necesidades, subastas inversas y calificación de proveedores.
 * Solo se descarga si la organización tiene capacidades de compradora verificada.
 */
export default function BuyerSection({ org }: { org: UserOrganization }) {
  return useRoutes([
    { index: true, element: <BuyerHome org={org} /> },
    { path: 'necesidades/nueva', element: <NewNeedPage org={org} /> },
    { path: 'necesidades/:needId', element: <NeedPage org={org} /> },
    { path: 'subastas/:auctionId/calificacion', element: <QualificationPage org={org} /> },
    { path: '*', element: <NotFoundPage /> },
  ])
}

const TABS = [
  { label: 'Todas', status: '' as const },
  { label: 'Borradores', status: 'draft' as const },
  { label: 'Inscripción', status: 'scheduled' as const },
  { label: 'En curso', status: 'active' as const },
  { label: 'Cerradas', status: 'closed' as const },
]

function BuyerHome({ org }: { org: UserOrganization }) {
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Compras</h1>
        <Button asChild>
          <Link to={`/org/${org.id}/compras/necesidades/nueva`}>Publicar necesidad</Link>
        </Button>
      </header>
      <NeedsList org={org} />
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Subastas inversas</h2>
        <p className="text-sm text-muted-foreground">
          Antes del inicio, califica a los proveedores inscritos: solo los admitidos pueden ofertar.
        </p>
        <AuctionList
          organization={org.id}
          mechanism="reverse"
          tabs={TABS}
          empty="Todavía no hay subastas inversas de esta organización."
          linkFor={(a) =>
            a.status === 'scheduled' || a.status === 'draft'
              ? `/org/${org.id}/compras/subastas/${a.id}/calificacion`
              : undefined
          }
        />
      </section>
    </div>
  )
}

function NeedsList({ org }: { org: UserOrganization }) {
  const [page, setPage] = useState(1)
  const needs = useQuery({
    queryKey: reverseKeys.orgNeeds(org.id, page),
    queryFn: ({ signal }) => fetchOrganizationNeeds(org.id, page, signal),
    placeholderData: keepPreviousData,
  })
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">Necesidades</h2>
      {needs.isPending ? (
        <PageLoading />
      ) : needs.isError ? (
        <ErrorAlert error={needs.error} />
      ) : needs.data.results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Todavía no hay necesidades publicadas.
        </p>
      ) : (
        <>
          <ul className="divide-y rounded-xl border">
            {needs.data.results.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <Link
                    to={`/org/${org.id}/compras/necesidades/${n.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {n.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {formatQuantity(n.quantity)} {n.unit} · entrega hasta{' '}
                    {formatDate(n.delivery_deadline)}
                  </p>
                </div>
                {/* `auction.status` es el guardado (no el efectivo): se enlaza al detalle en vez de mostrarlo. */}
                {n.auction ? (
                  <Link
                    to={`/subastas/${n.auction.id}`}
                    className="text-xs underline underline-offset-2"
                  >
                    Ver subasta ({n.auction.admitted_count} admitidos)
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">Sin subasta</span>
                )}
              </li>
            ))}
          </ul>
          {(needs.data.previous || needs.data.next) && (
            <nav aria-label="Páginas de necesidades" className="flex justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={!needs.data.previous}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!needs.data.next}
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
