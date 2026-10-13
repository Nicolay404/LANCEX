import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import { AppShell } from './app/AppShell'
import { AppProviders } from './app/providers'
import './index.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Falta #root en index.html')

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AppProviders>
  </StrictMode>,
)
