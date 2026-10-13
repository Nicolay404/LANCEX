import { useId, type ReactNode } from 'react'

import { Label } from '@/components/ui/label'

/** Etiqueta + control + mensaje de error accesible (aria-describedby). */
export function FormField({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string
  hint?: string
  children: (props: {
    id: string
    'aria-invalid': boolean
    'aria-describedby': string | undefined
  }) => ReactNode
}) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ')
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy || undefined })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
