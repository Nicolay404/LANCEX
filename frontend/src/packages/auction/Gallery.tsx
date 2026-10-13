import { useState } from 'react'

import { artFor } from '@/features/auctions/auctionArt'
import type { AuctionDetail } from '@/features/auctions/types'
import { cn } from '@/lib/utils'

/** Galería del detalle: imagen principal + miniaturas; sin fotos, la ilustración de la modalidad. */
export function Gallery({ a }: { a: AuctionDetail }) {
  const images = [...a.images].sort((x, y) => x.position - y.position)
  const [selected, setSelected] = useState(0)
  const title = a.title ?? 'la subasta'

  if (images.length === 0) {
    const art = artFor(a)
    return (
      <div
        aria-hidden
        className={cn(
          'flex aspect-[16/9] items-center justify-center rounded-3xl bg-gradient-to-br shadow-sm',
          art.bg,
        )}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-28 text-white/40"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={art.icon} />
        </svg>
      </div>
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
