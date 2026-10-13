import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

import { AppShell } from '@/app/AppShell'
import { createQueryClient } from '@/app/queryClient'

// eslint-disable-next-line react-refresh/only-export-components
function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}

export function renderApp(path: string, client: QueryClient = createQueryClient()) {
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppShell />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...utils, client }
}
