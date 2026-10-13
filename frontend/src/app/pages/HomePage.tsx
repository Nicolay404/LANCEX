import { Button } from '@/components/ui/button'

export function HomePage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Subastas</h1>
      <p className="text-muted-foreground">
        El catálogo se conectará a <code>GET /api/v1/auctions/</code> en LX-27.
      </p>
      <Button disabled>Explorar subastas</Button>
    </section>
  )
}
