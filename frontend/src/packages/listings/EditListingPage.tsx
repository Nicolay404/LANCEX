import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { Cap, hasCapability } from '@/features/auth/capabilities'
import { useMe } from '@/features/auth/session'

import { isApiError } from '@/api/errors'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { fetchListing, listingKeys, updateListing } from '@/features/listings/api'
import { ListingForm } from '@/features/listings/ListingForm'
import { toListingInput, type ListingFormValues } from '@/features/listings/schema'
import { type Listing, type ListingInput } from '@/features/listings/types'
import { formatDateTime } from '@/lib/dates'

function toFormValues(l: Listing): ListingFormValues {
  return {
    category_id: String(l.category.id),
    title: l.title,
    description: l.description,
    item_condition: l.item_condition,
    location_city: l.location_city,
  }
}

/** `/mis-publicaciones/:id/editar`: ver y editar una publicación propia. Ajena = 404. */
export default function EditListingPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const justCreated = (location.state as { created?: boolean } | null)?.created === true
  const queryClient = useQueryClient()
  const me = useMe()

  const listing = useQuery({
    queryKey: listingKeys.detail(id),
    queryFn: ({ signal }) => fetchListing(id, signal),
  })

  const mutation = useMutation({
    mutationFn: (changes: Partial<ListingInput>) => updateListing(id, changes),
    onSuccess: (updated) => queryClient.setQueryData(listingKeys.detail(id), updated),
    onError: (error) => {
      // Se abrió una subasta mientras editaba: refrescamos para mostrarla bloqueada.
      if (isApiError(error) && error.code === 'LISTING_LOCKED') {
        void queryClient.invalidateQueries({ queryKey: listingKeys.detail(id) })
      }
    },
  })

  if (listing.isPending) return <PageLoading />
  if (listing.isError) {
    if (isApiError(listing.error) && listing.error.status === 404) return <NotFoundPage />
    return <ErrorAlert error={listing.error} title="No se pudo cargar la publicación" />
  }

  const data = listing.data
  const submit = (values: ListingFormValues, dirty: (keyof ListingFormValues)[]) => {
    const input = toListingInput(values)
    const changes: Partial<ListingInput> = {}
    for (const key of dirty) Object.assign(changes, { [key]: input[key] })
    mutation.mutate(changes)
  }

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <Link to="/mis-publicaciones" className="text-sm text-muted-foreground hover:underline">
          ← Mis publicaciones
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{data.title}</h1>
        <p className="text-sm text-muted-foreground">
          {data.category.name} · Creada {formatDateTime(data.created_at)} · Actualizada{' '}
          {formatDateTime(data.updated_at)}
        </p>
      </header>

      {data.editable && hasCapability(me, Cap.AUCTION_CREATE_PERSONAL) && (
        <Button asChild variant="secondary">
          <Link to={`/mis-subastas/nueva?listing=${data.id}`}>
            Crear subasta con esta publicación
          </Link>
        </Button>
      )}

      {justCreated && !mutation.isSuccess && (
        <Alert variant="success">Publicación creada. Puedes seguir editándola aquí.</Alert>
      )}
      {mutation.isSuccess && <Alert variant="success">Cambios guardados.</Alert>}
      {!data.editable && (
        <Alert>
          Esta publicación tiene una subasta en borrador, programada o activa, así que no se puede
          editar. Podrás modificarla cuando la subasta termine o se cancele.
        </Alert>
      )}

      <ListingForm
        initialValues={toFormValues(data)}
        submitLabel="Guardar cambios"
        pendingLabel="Guardando…"
        pending={mutation.isPending}
        error={
          isApiError(mutation.error) && mutation.error.code === 'LISTING_LOCKED'
            ? null
            : mutation.error
        }
        disabled={!data.editable}
        requireChanges
        onSubmit={submit}
      />

      {data.images.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Imágenes</h2>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {[...data.images]
              .sort((a, b) => a.position - b.position)
              .map((img) => (
                <li key={img.position}>
                  <img
                    src={img.url}
                    alt={`Imagen ${img.position + 1} de ${data.title}`}
                    className="aspect-square w-full rounded-md border object-cover"
                    referrerPolicy="no-referrer"
                  />
                </li>
              ))}
          </ul>
        </section>
      )}
    </section>
  )
}
