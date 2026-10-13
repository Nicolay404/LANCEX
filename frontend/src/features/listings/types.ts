/** Catálogo y publicaciones (CONTRATO-API-INICIAL.md §Catálogo y publicaciones). */
import type { IsoDateTime, Uuid } from '@/api/types'

export interface Category {
  id: number
  name: string
  slug: string
}

export const ITEM_CONDITIONS = ['new', 'used', 'refurbished'] as const
export type ItemCondition = (typeof ITEM_CONDITIONS)[number]

export const ITEM_CONDITION_LABEL: Record<ItemCondition, string> = {
  new: 'Nuevo',
  used: 'Usado',
  refurbished: 'Reacondicionado',
}

export interface ListingImage {
  id?: Uuid
  url: string
  position: number
}

/** Vista del dueño (`ListingOwnerSerializer` + `images`). */
export interface Listing {
  id: Uuid
  category: { id: number; name: string }
  title: string
  description: string
  item_condition: ItemCondition
  location_city: string
  created_at: IsoDateTime
  updated_at: IsoDateTime
  /** `false` si la publicación tiene una subasta en borrador, programada o activa. */
  editable: boolean
  images: ListingImage[]
}

/** Únicos campos que acepta el backend (entrada estricta: otro campo = UNKNOWN_FIELD). */
export interface ListingInput {
  category_id: number
  title: string
  description: string
  item_condition: ItemCondition
  location_city: string
}

export const LISTING_FIELDS = [
  'category_id',
  'title',
  'description',
  'item_condition',
  'location_city',
] as const satisfies readonly (keyof ListingInput)[]
