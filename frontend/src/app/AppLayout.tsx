import { NavLink, Outlet } from 'react-router'

import { cn } from '@/lib/utils'

/**
 * Layout base (LX-07). El menú definitivo se construirá con las `capabilities`
 * de `GET /auth/me` (ADR-0006, LX-14); por ahora solo hay rutas públicas.
 */
export function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <NavLink to="/" className="text-lg font-bold tracking-tight">
            LANCEX
          </NavLink>
          <nav aria-label="Principal" className="flex items-center gap-1 text-sm">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn('rounded-md px-3 py-1.5 hover:bg-accent', isActive && 'bg-accent font-medium')
              }
            >
              Subastas
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted-foreground">
          LANCEX · plataforma de subastas
        </div>
      </footer>
    </div>
  )
}
