import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'

import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Button } from '@/components/ui/button'
import { Countdown } from '@/features/auctions/Countdown'
import { MECHANISM_LABEL } from '@/features/auctions/labels'
import { fetchParticipations, meKeys } from '@/features/me/api'
import {
  MY_STATUS_LABEL,
  MY_STATUS_TONE,
  type Participation,
  type ParticipationTab,
} from '@/features/me/types'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

const TABS: { tab: ParticipationTab; label: string; empty: string }[] = [
  { tab: 'active', label: 'Activas', empty: 'No participas en subastas abiertas ahora.' },
  { tab: 'won', label: 'Ganadas', empty: 'Todavía no has ganado subastas.' },
  { tab: 'lost', label: 'No ganadas', empty: 'Nada por aquí.' },
]

/** `/mis-pujas` (capacidad `bid.place`): `GET /me/participations/` — solo datos propios. */
export default function MyBidsPage() {
  const [params, setParams] = useSearchParams()
  const current = TABS.find((t) => t.tab === params.get('tab')) ?? TABS[0]!
  const page = Math.max(1, Number(params.get('page')) || 1)
  const list = useQuery({
    queryKey: meKeys.participations(current.tab, page),
    queryFn: ({ signal }) => fetchParticipations(current.tab, page, signal),
    refetchInterval: current.tab === 'active' ? 15_000 : false,
    placeholderData: keepPreviousData,
  })
  const go = (tab: ParticipationTab, p = 1) => {
    const next = new URLSearchParams()
    if (tab !== 'active') next.set('tab', tab)
    if (p > 1) next.set('page', String(p))
    setParams(next, { replace: true })
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Mis pujas</h1>
      <div role="tablist" aria-label="Estado" className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.tab}
            role="tab"
            type="button"
            aria-selected={t === current}
            onClick={() => go(t.tab)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              t === current
                ? 'border-foreground font-medium'
                : 'border-transparent text-muted-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {list.isPending ? (
        <PageLoading />
      ) : list.isError ? (
        <ErrorAlert error={list.error} />
      ) : list.data.results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {current.empty}
        </p>
      ) : (
        <>
          <ul className="divide-y rounded-xl border">
            {list.data.results.map((p) => (
              <ParticipationRow key={p.auction_id} p={p} />
            ))}
          </ul>
          {(list.data.previous || list.data.next) && (
            <nav aria-label="Páginas" className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={!list.data.previous}
                onClick={() => go(current.tab, page - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">Página {page}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!list.data.next}
                onClick={() => go(current.tab, page + 1)}
              >
                Siguiente
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  )
}

function ParticipationRow({ p }: { p: Participation }) {
  const finished = p.status === 'closed' || p.status === 'cancelled'
  const mine: [string, string | null][] = [
    ['Tu última puja', p.my_last_bid],
    ['Tu máximo automático', p.my_proxy_max],
    ['Tu oferta sellada', p.my_sealed_offer],
  ]
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="min-w-0 space-y-1">
        <Link
          to={finished ? `/subastas/${p.auction_id}/resultado` : `/subastas/${p.auction_id}`}
          className="font-medium underline-offset-2 hover:underline"
        >
          {p.title ?? 'Subasta'}
        </Link>
        <p className="text-xs text-muted-foreground">
          {MECHANISM_LABEL[p.mechanism]}
          {p.current_price &&
            ` · ${finished ? 'precio final' : 'precio actual'} ${formatMoney(p.current_price)}`}
          {mine
            .filter(([, v]) => v)
            .map(([label, v]) => ` · ${label} ${formatMoney(v)}`)
            .join('')}
        </p>
        {p.status === 'active' && (
          <p className="text-xs text-muted-foreground tabular-nums">
            <Countdown
              target={p.ends_at}
              prefix={p.closing_policy === 'candle' ? 'Termina a más tardar en' : 'Termina en'}
              elapsedLabel="Cerrando…"
            />
          </p>
        )}
      </div>
      <span className={cn('rounded px-2 py-0.5 text-xs font-medium', MY_STATUS_TONE[p.my_status])}>
        {MY_STATUS_LABEL[p.my_status] ?? p.my_status}
      </span>
    </li>
  )
}
