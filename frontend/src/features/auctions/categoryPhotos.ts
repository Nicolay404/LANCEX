/**
 * Fotos de referencia por categoría (Unsplash, licencia libre, enlazadas desde su CDN).
 * El catálogo (`GET /auctions/`) no trae fotos: se muestra una foto ilustrativa de la
 * categoría. En el detalle, si la publicación tiene fotos propias, siempre se usan esas.
 */
const UNSPLASH = 'https://images.unsplash.com/photo-'

// El orden importa: "inmuebles" contiene "mueble".
const PHOTOS: [RegExp, string][] = [
  [/tecno/, '1496181133206-80ce9b88a853'], // laptop
  [/vehic|auto|moto/, '1494976388531-d1058494cdd8'], // auto deportivo
  [/arte|colecc/, '1579783902614-a3fb3927b6a5'], // pintura al óleo
  [/inmueble|casa|terreno/, '1600585154340-be6161a56a0c'], // casa moderna
  [/hogar|mueble/, '1586023492125-27b2c045efd7'], // sillón
  [/insumo|suministro/, '1553413077-190dd305871c'], // bodega
  [/maquin|equipo/, '1504917595217-d4dc5ebe6122'], // soldadura
  [/otro/, '1441986300917-64674bd600d8'], // tienda
]
const DEFAULT_PHOTO = '1523170335258-f5ed11844a49' // reloj

/** Fotos del mosaico de la portada (decorativas). */
export const HERO_PHOTOS = [
  { id: '1523170335258-f5ed11844a49', label: 'Relojes' },
  { id: '1503376780353-7e6692767b70', label: 'Vehículos' },
  { id: '1541961017774-22349e4a1262', label: 'Arte' },
  { id: '1524758631624-e2822e304c36', label: 'Hogar' },
] as const

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function unsplashUrl(id: string, width = 800): string {
  return `${UNSPLASH}${id}?w=${width}&q=70&auto=format&fit=crop`
}

export function photoForCategory(name: string | null | undefined, width = 800): string {
  const n = normalize(name ?? '')
  const hit = PHOTOS.find(([re]) => re.test(n))
  return unsplashUrl(hit ? hit[1] : DEFAULT_PHOTO, width)
}
