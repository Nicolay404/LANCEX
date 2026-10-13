import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'

import { api } from '@/api/client'
import { isApiError } from '@/api/errors'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { auctionKeys, fetchAuction } from '@/features/auctions/api'
import { verifyCandle, type CandleCheck, type CandleProof } from '@/lib/candleVerify'
import { formatDateTime } from '@/lib/dates'

/**
 * `/subastas/:id/verificar-vela` (público, LX-62): recalcula en el navegador, con Web Crypto,
 * que la semilla revelada coincide con el compromiso publicado y produce el mismo instante.
 * No confía en el resultado del servidor: solo usa los datos de la prueba.
 */
export default function CandleVerifyPage() {
  const { id = '' } = useParams()
  const detail = useQuery({
    queryKey: auctionKeys.detail(id),
    queryFn: ({ signal }) => fetchAuction(id, signal),
  })
  const proof = useQuery({
    queryKey: ['auctions', id, 'candle-proof'],
    queryFn: ({ signal }) =>
      api.get<CandleProof>(`/auctions/${encodeURIComponent(id)}/candle-proof/`, { signal }),
    retry: false,
  })
  const published = detail.data?.candle?.commitment ?? null
  const check = useQuery({
    queryKey: ['auctions', id, 'candle-check', proof.data, published],
    queryFn: () => verifyCandle(proof.data!, published),
    enabled: proof.isSuccess && detail.isSuccess,
    staleTime: Infinity,
  })

  if (detail.isPending || proof.isPending) return <PageLoading />
  if (detail.isError) {
    if (isApiError(detail.error) && detail.error.status === 404) return <NotFoundPage />
    return <ErrorAlert error={detail.error} />
  }
  const title = detail.data.title ?? 'Subasta'
  const back = (
    <Link to={`/subastas/${id}`} className="text-sm text-muted-foreground hover:underline">
      ← Volver a la subasta
    </Link>
  )

  if (proof.isError) {
    const code = isApiError(proof.error) ? proof.error.code : null
    return (
      <section className="max-w-2xl space-y-4">
        {back}
        <h1 className="text-2xl font-semibold tracking-tight">Verificar vela: {title}</h1>
        {code === 'NOT_REVEALED_YET' ? (
          <Alert>La semilla se revela cuando la subasta cierra. Vuelve después del cierre.</Alert>
        ) : code === 'MECHANISM_MISMATCH' ? (
          <Alert>Esta subasta no cierra por vela.</Alert>
        ) : (
          <ErrorAlert error={proof.error} />
        )}
      </section>
    )
  }

  const p = proof.data
  return (
    <section className="max-w-2xl space-y-6">
      <header className="space-y-1">
        {back}
        <h1 className="text-2xl font-semibold tracking-tight">Verificar vela: {title}</h1>
        <p className="text-sm text-muted-foreground">
          Comprobamos en tu navegador que el instante de cierre no se eligió después de ver las
          pujas.
        </p>
      </header>

      {check.isPending ? (
        <PageLoading label="Verificando…" />
      ) : check.isError ? (
        <Alert variant="destructive">
          No se pudo verificar: los datos de la prueba no son válidos.
        </Alert>
      ) : (
        <Result check={check.data} closeAt={p.close_at} />
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Datos de la prueba</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {(
            [
              ['Subasta', p.auction_id],
              ['Compromiso (publicado al iniciar)', published ?? '—'],
              ['Compromiso (en la prueba)', p.commitment],
              ['Semilla revelada', p.seed_hex],
              ['Inicio de la ventana', `${formatDateTime(p.window_start)} (${p.window_start})`],
              ['Duración de la ventana', `${p.window_s} s`],
              ['Instante de cierre', `${formatDateTime(p.close_at)} (${p.close_at})`],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-all font-mono text-xs leading-5">{v}</dd>
            </div>
          ))}
        </dl>
        {p.algorithm && <p className="text-xs text-muted-foreground">Algoritmo: {p.algorithm}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Verificarlo por tu cuenta</h2>
        <p className="text-sm text-muted-foreground">Con Python y el script del repositorio:</p>
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
          {`python scripts/verify_candle.py --auction-id ${p.auction_id} \\\n  --commitment ${p.commitment} \\\n  --seed-hex ${p.seed_hex} \\\n  --window-start ${p.window_start} --window-s ${p.window_s} \\\n  --close-at ${p.close_at}`}
        </pre>
      </section>
    </section>
  )
}

function Result({ check, closeAt }: { check: CandleCheck; closeAt: string }) {
  const row = (ok: boolean | null, text: string) => (
    <li className="flex gap-2">
      <span aria-hidden="true">{ok === null ? '–' : ok ? '✅' : '❌'}</span>
      <span>
        {text}
        <span className="sr-only">
          {ok === null ? ': no disponible' : ok ? ': correcto' : ': no coincide'}
        </span>
      </span>
    </li>
  )
  return (
    <div className="space-y-3">
      <Alert variant={check.ok ? 'success' : 'destructive'}>
        {check.ok
          ? 'Verificación correcta: el cierre por vela fue honesto.'
          : 'La verificación falló: los datos revelados no coinciden con lo publicado.'}
      </Alert>
      <ul className="space-y-1 text-sm">
        {row(check.commitmentOk, 'sha256(semilla) coincide con el compromiso de la prueba')}
        {row(
          check.publishedOk,
          'Ese compromiso es el mismo que se mostró públicamente antes del cierre',
        )}
        {row(
          check.instantOk,
          `El instante recalculado (${check.expectedCloseAt}) coincide con el revelado (${closeAt})`,
        )}
      </ul>
    </div>
  )
}
