/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

// ADR-0004: el navegador solo habla con Vite (:5173); /api se reenvía a Django.
// BACKEND_URL no lleva prefijo VITE_: solo lo lee este archivo, nunca llega al navegador.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.BACKEND_URL || 'http://localhost:8000'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // Sin changeOrigin: Django recibe Host localhost:5173, que coincide con
        // CSRF_TRUSTED_ORIGINS y con el origen de las cookies de sesión.
        '/api': { target: backendUrl },
      },
    },
    build: {
      // Sin source maps ni console en producción (frontend/README.md, ADR-0006).
      sourcemap: false,
      rolldownOptions: {
        output: { minify: { compress: { dropConsole: true, dropDebugger: true } } },
      },
    },
    test: {
      environment: 'jsdom',
      // Las pruebas E2E (Playwright, `e2e/`) no corren con Vitest.
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      restoreMocks: true,
      unstubGlobals: true,
    },
  }
})
