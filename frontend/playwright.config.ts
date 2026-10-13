import { defineConfig, devices } from '@playwright/test'

/**
 * E2E (LX-74): un recorrido completo por modalidad contra el backend REAL.
 * Requisitos: Django en BACKEND_URL (por defecto :8000) con `seed_demo`, `close_due_auctions --loop`
 * y la misma contraseña demo en E2E_DEMO_PASSWORD. Vite lo levanta Playwright (o se reutiliza).
 * Nunca apuntar a Supabase: las pruebas crean datos.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined

export default defineConfig({
  testDir: './e2e',
  // Cada recorrido espera un cierre real (2 a 6 min): en paralelo para no sumar tiempos.
  fullyParallel: true,
  workers: 4,
  timeout: 10 * 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'es-EC',
    timezoneId: 'America/Guayaquil',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    env: { BACKEND_URL: process.env.BACKEND_URL ?? 'http://localhost:8000' },
  },
})
