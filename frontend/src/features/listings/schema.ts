import { z } from 'zod'

import { ITEM_CONDITIONS, type ItemCondition, type ListingInput } from './types'

// Límites del backend (ListingInput y CHECK de la tabla listing). Aquí solo son UX.
export const TITLE_MAX = 120
export const DESCRIPTION_MAX = 5000
export const CITY_MAX = 80

/** Valores del formulario: todo string (los <select> trabajan con strings). */
export const listingSchema = z.object({
  category_id: z.string().regex(/^[1-9]\d*$/, 'Elige una categoría.'),
  title: z
    .string()
    .trim()
    .min(1, 'Escribe un título.')
    .max(TITLE_MAX, `Máximo ${TITLE_MAX} caracteres.`),
  description: z
    .string()
    .trim()
    .min(1, 'Describe el artículo.')
    .max(DESCRIPTION_MAX, `Máximo ${DESCRIPTION_MAX} caracteres.`),
  item_condition: z
    .string()
    .refine((v) => ITEM_CONDITIONS.some((c) => c === v), 'Elige el estado del artículo.'),
  location_city: z
    .string()
    .trim()
    .min(1, 'Indica la ciudad.')
    .max(CITY_MAX, `Máximo ${CITY_MAX} caracteres.`),
})

export type ListingFormValues = z.infer<typeof listingSchema>

export const EMPTY_LISTING_FORM: ListingFormValues = {
  category_id: '',
  title: '',
  description: '',
  item_condition: '',
  location_city: '',
}

export function toListingInput(v: ListingFormValues): ListingInput {
  return {
    category_id: Number(v.category_id),
    title: v.title,
    description: v.description,
    item_condition: v.item_condition as ItemCondition,
    location_city: v.location_city,
  }
}
