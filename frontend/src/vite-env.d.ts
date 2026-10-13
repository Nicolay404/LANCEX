/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Ruta relativa de la API. Todo VITE_* llega al navegador: nunca secretos. */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
