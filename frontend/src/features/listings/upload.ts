/**
 * Paso 2 de la subida: el navegador envía el archivo directo a la URL firmada de Storage.
 * Sin cookies ni cabeceras propias (la URL ya autoriza esa sola ruta); nunca hay claves en el cliente.
 */
export async function putToSignedUrl(url: string, file: File): Promise<void> {
  if (!url.startsWith('https://')) throw new Error('URL de subida no válida.')
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
    credentials: 'omit',
  })
  if (!response.ok) throw new Error(`Storage respondió ${response.status}.`)
}

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const IMAGE_MAX_COUNT = 6
