import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'

import { createListing, listingKeys } from '@/features/listings/api'
import { ListingForm } from '@/features/listings/ListingForm'
import { toListingInput } from '@/features/listings/schema'

/** `/mis-publicaciones/nueva`: crea el artículo (sin subasta todavía). */
export default function NewListingPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const mutation = useMutation({
    mutationFn: createListing,
    onSuccess: (listing) => {
      queryClient.setQueryData(listingKeys.detail(listing.id), listing)
      void navigate(`/mis-publicaciones/${listing.id}/editar`, {
        replace: true,
        state: { created: true },
      })
    },
  })

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <Link to="/mis-publicaciones" className="text-sm text-muted-foreground hover:underline">
          ← Mis publicaciones
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva publicación</h1>
        <p className="text-sm text-muted-foreground">
          Describe el artículo. Después podrás crear una subasta con él.
        </p>
      </header>
      <ListingForm
        submitLabel="Guardar publicación"
        pendingLabel="Guardando…"
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={(values) => mutation.mutate(toListingInput(values))}
      />
    </section>
  )
}
