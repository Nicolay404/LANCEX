import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'

import { AppProviders } from './app/providers'
import { routes } from './app/routes'
import './index.css'

const router = createBrowserRouter(routes)

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Falta #root en index.html')

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
