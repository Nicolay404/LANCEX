import { useMemo } from 'react'
import { encode } from 'uqr'

/**
 * Código QR generado EN EL NAVEGADOR (`uqr`, sin dependencias). Nunca usar un servicio web de QR:
 * el contenido (p. ej. el secreto del doble factor) saldría a un tercero.
 * Se dibuja como SVG con un solo `<path>`, sin `innerHTML`.
 */
export function QrCode({
  value,
  label,
  size = 192,
}: {
  value: string
  label: string
  size?: number
}) {
  const { path, modules } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 })
    let d = ''
    qr.data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`
      }),
    )
    return { path: d, modules: qr.size }
  }, [value])

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      shapeRendering="crispEdges"
      className="rounded-lg bg-white"
    >
      <path d={path} fill="#000" />
    </svg>
  )
}
