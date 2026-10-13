import * as React from 'react'

import { cn } from '@/lib/utils'

/** `<select>` nativo con el estilo de los inputs (accesible y sin dependencias extra). */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'flex h-10 w-full rounded-lg border border-input bg-card px-3 py-1 text-base shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

export { NativeSelect }
