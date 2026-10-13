import type { RouteObject } from 'react-router'

import { AppLayout } from './AppLayout'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'

/**
 * Rutas públicas base. Las de cada rol se registrarán solo si `/auth/me` trae la
 * capacidad correspondiente, con `import()` dinámico por paquete (ADR-0006).
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
