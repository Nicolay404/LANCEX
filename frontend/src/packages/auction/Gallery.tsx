import { useState } from 'react'

import { artFor } from '@/features/auctions/auctionArt'
import { photoForCategory } from '@/features/auctions/categoryPhotos'
import type { AuctionDetail } from '@/features/auctions/types'
import { cn } from '@/lib/utils'

/** Galería del detalle: imagen principal + miniaturas; sin fotos, la ilustración de la modalidad. */
export function Gallery({ a }: { a: AuctionDetail }) {
  const images = [...a.images].sort((x, y) => x.position - y.position)
  const [selected, setSelected] = useState(0)
  const title = a.title ?? 'la subasta'

  if (images.length === 0) {
    // Sin fotos propias: foto ilustrativa de la categoría, rotulada como tal.
    const art = artFor(a)
    return (
      <figure
        className={cn(
          'relative aspect-[16/9] overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br',
          art.bg,
        )}
      >
        <img
          src={photoForCategory(
            a.category?.name ?? (a.mechanism === 'reverse' ? 'insumos' : null),
            1200,
          )}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
        <figcaption className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2.5 py-1 text-xs text-white/85 backdrop-blur">
          Imagen ilustrativa de la categoría
        </figcaption>
      </figure>
    )
  }

  const main = images[Math.min(selected, images.length - 1)]!
  return (
    <div className="space-y-3">
      <img
        src={main.url}
        alt={`Imagen ${main.position + 1} de ${title}`}
        className="aspect-[4/3] w-full rounded-3xl border object-cover shadow-sm"
        referrerPolicy="no-referrer"
      />
      {images.length > 1 && (
        <ul className="grid grid-cols-6 gap-2">
          {images.map((img, i) => (
            <li key={img.position}>
              <button
                type="button"
                onClick={() => setSelected(i)}
                aria-label={`Ver imagen ${img.position + 1}`}
                aria-pressed={i === selected}
                className={cn(
                  'block w-full overflow-hidden rounded-xl border-2 transition',
                  i === selected
                    ? 'border-primary'
                    : 'border-transparent opacity-70 hover:opacity-100',
                )}
              >
                <img
                  src={img.url}
                  alt=""
                  className="aspect-square w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
