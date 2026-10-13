import { api } from '@/api/client'
import type { Uuid } from '@/api/types'

import type { Category, Listing, ListingInput } from './types'

export const listingKeys = {
  categories: ['categories'] as const,
  detail: (id: Uuid) => ['listings', id] as const,
}

export const fetchCategories = (signal?: AbortSignal) =>
  api.get<Category[]>('/categories/', { signal })

export const fetchListing = (id: Uuid, signal?: AbortSignal) =>
  api.get<Listing>(`/listings/${encodeURIComponent(id)}/`, { signal })

export const createListing = (input: ListingInput) => api.post<Listing>('/listings/', input)

/** PATCH parcial: se envían solo los campos que cambiaron. */
export const updateListing = (id: Uuid, changes: Partial<ListingInput>) =>
  api.patch<Listing>(`/listings/${encodeURIComponent(id)}/`, changes)
