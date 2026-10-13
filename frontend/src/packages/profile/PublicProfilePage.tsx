import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'

import { api } from '@/api/client'
import { isApiError } from '@/api/errors'
import type { IsoDateTime, Uuid } from '@/api/types'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { AuctionList } from '@/features/auctions/AuctionList'
import { resultLinkIfFinished } from '@/features/auctions/links'
import { Cap, hasCapability } from '@/features/auth/capabilities'
import { useMe } from '@/features/auth/session'
import { ReportButton } from '@/features/reports/ReportButton'

interface PublicProfile {
  id: Uuid
  display_name: string
  rating_avg: string | null
  rating_count: number
  member_since: IsoDateTime
  bio?: string | null
  location_city?: string | null
}

const memberSince = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  month: 'long',
  year: 'numeric',
})

/** `/usuarios/:id` (público): nombre visible y reputación. Nunca el email (matriz de visibilidad). */
export default function PublicProfilePage() {
  const { id = '' } = useParams()
  const me = useMe()
  const profile = useQuery({
    queryKey: ['users', id],
    queryFn: ({ signal }) =>
      api.get<PublicProfile>(`/users/${encodeURIComponent(id)}/`, { signal }),
  })

  if (profile.isPending) return <PageLoading />
  if (profile.isError) {
    if (isApiError(profile.error) && profile.error.status === 404) return <NotFoundPage />
    return <ErrorAlert error={profile.error} />
  }
  const p = profile.data
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{p.display_name}</h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Reputación</dt>
        <dd>
          {p.rating_avg
            ? `★ ${p.rating_avg} (${p.rating_count} ${p.rating_count === 1 ? 'calificación' : 'calificaciones'})`
            : 'Sin calificaciones todavía'}
        </dd>
        <dt className="text-muted-foreground">En LANCEX desde</dt>
        <dd>{memberSince.format(new Date(p.member_since))}</dd>
        {p.location_city && (
          <>
            <dt className="text-muted-foreground">Ciudad</dt>
            <dd>{p.location_city}</dd>
          </>
        )}
      </dl>
      {/* Texto plano: nunca HTML del usuario. */}
      {p.bio && <p className="text-sm leading-relaxed whitespace-pre-line">{p.bio}</p>}
      {hasCapability(me, Cap.REPORT_CREATE) && me?.id !== p.id && (
        <ReportButton targetType="user" targetId={p.id} className="-ml-3" />
      )}
      <section className="space-y-3 pt-4">
        <h2 className="text-lg font-medium">Subastas</h2>
        <AuctionList
          seller={p.id}
          tabs={[
            { label: 'Activas', status: 'active' },
            { label: 'Próximas', status: 'scheduled' },
            { label: 'Terminadas', status: 'closed' },
          ]}
          empty="No hay subastas en este estado."
          linkFor={resultLinkIfFinished}
        />
      </section>
    </section>
  )
}
