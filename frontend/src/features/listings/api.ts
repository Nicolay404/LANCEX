import { api } from '@/api/client'
import type { Paginated, Uuid } from '@/api/types'

import type { Category, Listing, ListingInput, OwnListingRow } from './types'

export const listingKeys = {
  categories: ['categories'] as const,
  detail: (id: Uuid) => ['listings', id] as const,
  mine: (page: number) => ['listings', 'mine', page] as const,
}

/** `GET /listings/`: mis publicaciones (paginado, más recientes primero). */
export const fetchMyListings = (page: number, signal?: AbortSignal) =>
  api.get<Paginated<OwnListingRow>>('/listings/', {
    signal,
    query: { page: page > 1 ? page : undefined, page_size: 20 },
  })

export const fetchCategories = (signal?: AbortSignal) =>
  api.get<Category[]>('/categories/', { signal })

export const fetchListing = (id: Uuid, signal?: AbortSignal) =>
  api.get<Listing>(`/listings/${encodeURIComponent(id)}/`, { signal })

export const createListing = (input: ListingInput) => api.post<Listing>('/listings/', input)

/** PATCH parcial: se envían solo los campos que cambiaron. */
export const updateListing = (id: Uuid, changes: Partial<ListingInput>) =>
  api.patch<Listing>(`/listings/${encodeURIComponent(id)}/`, changes)

/** Paso 1: el backend valida tipo/tamaño declarados y firma una ruta suya (URL de subida, 2 h). */
export const requestImageUpload = (listingId: Uuid, content_type: string, size_bytes: number) =>
  api.post<{ upload_url: string; storage_path: string; expires_in: number }>(
    `/listings/${encodeURIComponent(listingId)}/images/upload-url/`,
    { content_type, size_bytes },
  )

/** Paso 3: el backend comprueba los metadatos REALES del objeto subido y lo registra. */
export const confirmImage = (listingId: Uuid, storage_path: string, position: number) =>
  api.post<{ id: Uuid; position: number; content_type: string }>(
    `/listings/${encodeURIComponent(listingId)}/images/`,
    { storage_path, position },
  )

export const deleteImage = (listingId: Uuid, imageId: Uuid) =>
  api.delete<void>(
    `/listings/${encodeURIComponent(listingId)}/images/${encodeURIComponent(imageId)}/`,
  )
