import { cn } from '@/lib/utils'

/**
 * Marca LANCEX: la "X" de trazos paralelos (versión vectorial del logo oficial) y el nombre.
 * Los trazos oscuros del original van en blanco porque la interfaz es oscura.
 */
export function Logo({
  className,
  showName = true,
  size = 'md',
}: {
  className?: string
  /** `lg`: cabecera. */
  size?: 'md' | 'lg'
  /** `false`: solo el símbolo. */
  showName?: boolean
  /** Se mantiene por compatibilidad: el logo ya es para fondo oscuro. */
  inverted?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <LogoMark className={cn('w-auto shrink-0', size === 'lg' ? 'h-10' : 'h-8')} />
      {showName && (
        <span
          className={cn(
            'font-extrabold tracking-tight text-white',
            size === 'lg' ? 'text-2xl' : 'text-xl',
          )}
        >
          LANCE<span className="text-link">X</span>
        </span>
      )}
    </span>
  )
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="220 245 585 533" className={className}>
      <g fill="#ffffff">
        <path d="M228 255H390L512 380L632 255H698L460 505Z" />
        <path d="M518 475L610 453L312 768H228Z" />
        <path d="M598 555L795 768H698L553 605Z" />
      </g>
      <g fill="#3574f6">
        <path d="M725 255H795L610 453L518 475Z" />
        <path d="M655 432H717L415 750Q398 768 380 768H337Z" />
      </g>
    </svg>
  )
}
