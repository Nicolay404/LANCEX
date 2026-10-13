import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type ChangeEvent } from 'react'

import { isApiError } from '@/api/errors'
import { ErrorAlert } from '@/components/ErrorAlert'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { confirmImage, deleteImage, listingKeys, requestImageUpload } from './api'
import type { Listing } from './types'
import { IMAGE_MAX_BYTES, IMAGE_MAX_COUNT, IMAGE_TYPES, putToSignedUrl } from './upload'

type Step = 'idle' | 'signing' | 'uploading' | 'confirming'
const STEP_LABEL: Record<Step, string> = {
  idle: '',
  signing: 'Preparando la subida…',
  uploading: 'Subiendo la imagen…',
  confirming: 'Verificando la imagen…',
}

function storageMessage(error: unknown): string | null {
  return isApiError(error) && error.code === 'STORAGE_UNAVAILABLE'
    ? 'El almacenamiento de imágenes no está disponible por ahora. Inténtalo más tarde.'
    : null
}

/** Imágenes de la publicación (LX-73): subir con URL firmada, ver y quitar. Máx. 6, 5 MB. */
export function ListingImages({ listing }: { listing: Listing }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('idle')
  const [clientError, setClientError] = useState<string | null>(null)
  const images = [...listing.images].sort((a, b) => a.position - b.position)
  const refresh = () => queryClient.invalidateQueries({ queryKey: listingKeys.detail(listing.id) })

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const used = new Set(images.map((i) => i.position))
      const position = [0, 1, 2, 3, 4, 5].find((p) => !used.has(p)) ?? 0
      setStep('signing')
      const signed = await requestImageUpload(listing.id, file.type, file.size)
      setStep('uploading')
      await putToSignedUrl(signed.upload_url, file)
      setStep('confirming')
      await confirmImage(listing.id, signed.storage_path, position)
    },
    onSettled: () => {
      setStep('idle')
      if (inputRef.current) inputRef.current.value = ''
      void refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (imageId: string) => deleteImage(listing.id, imageId),
    onSettled: () => void refresh(),
  })

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    setClientError(null)
    const file = e.target.files?.[0]
    if (!file) return
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setClientError('Solo JPEG, PNG o WebP.')
      return
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setClientError('La imagen supera 5 MB.')
      return
    }
    upload.mutate(file)
  }

  const full = images.length >= IMAGE_MAX_COUNT
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">Imágenes</h2>
      {images.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay imágenes.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {images.map((img) => (
            <li key={img.id ?? img.position} className="space-y-1">
              <img
                src={img.url}
                alt={`Imagen ${img.position + 1} de ${listing.title}`}
                className="aspect-square w-full rounded-md border object-cover"
                referrerPolicy="no-referrer"
              />
              {listing.editable && img.id && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(img.id!)}
                >
                  Quitar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {listing.editable && (
        <div className="space-y-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <span className="sr-only">Agregar imagen</span>
            <input
              ref={inputRef}
              type="file"
              accept={IMAGE_TYPES.join(',')}
              aria-label="Agregar imagen"
              disabled={full || upload.isPending}
              onChange={onFile}
              className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {full
              ? `Ya tienes ${IMAGE_MAX_COUNT} imágenes (máximo).`
              : `JPEG, PNG o WebP, hasta 5 MB. ${images.length}/${IMAGE_MAX_COUNT}.`}
          </p>
          {step !== 'idle' && (
            <p className="text-sm" role="status">
              {STEP_LABEL[step]}
            </p>
          )}
          {clientError && <p className="text-xs text-destructive">{clientError}</p>}
          {upload.isError &&
            (storageMessage(upload.error) ? (
              <Alert>{storageMessage(upload.error)}</Alert>
            ) : (
              <ErrorAlert error={upload.error} title="No se pudo subir la imagen" />
            ))}
          {remove.isError &&
            (storageMessage(remove.error) ? (
              <Alert>{storageMessage(remove.error)} La imagen sigue en la publicación.</Alert>
            ) : (
              <ErrorAlert error={remove.error} title="No se pudo quitar la imagen" />
            ))}
        </div>
      )}
    </section>
  )
}
