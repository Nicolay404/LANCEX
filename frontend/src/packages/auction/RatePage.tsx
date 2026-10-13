import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { isApiError } from '@/api/errors'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { auctionKeys, fetchAuction, fetchResult, submitRating } from '@/features/auctions/api'

const COMMENT_MAX = 300
const SCORE_LABEL = ['', 'Muy mala', 'Mala', 'Regular', 'Buena', 'Excelente']

/** `/calificar/:auctionId` (capacidad `rating.submit`): 1 a 5 y comentario, una sola vez. */
export default function RatePage() {
  const { auctionId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const detail = useQuery({
    queryKey: auctionKeys.detail(auctionId),
    queryFn: ({ signal }) => fetchAuction(auctionId, signal),
  })
  const result = useQuery({
    queryKey: auctionKeys.result(auctionId),
    queryFn: ({ signal }) => fetchResult(auctionId, signal),
  })
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')
  const mutation = useMutation({
    mutationFn: () => submitRating(auctionId, score, comment.trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: auctionKeys.result(auctionId) })
      void navigate(`/subastas/${auctionId}/resultado`)
    },
  })

  if (detail.isPending || result.isPending) return <PageLoading />
  const error = detail.error ?? result.error
  if (error) {
    if (isApiError(error) && error.status === 404) return <NotFoundPage />
    return <ErrorAlert error={error} />
  }
  const v = result.data!.viewer
  const back = (
    <Link
      to={`/subastas/${auctionId}/resultado`}
      className="text-sm text-muted-foreground hover:underline"
    >
      ← Volver al resultado
    </Link>
  )
  if (!v?.can_rate) {
    return (
      <section className="max-w-xl space-y-4">
        {back}
        <h1 className="text-2xl font-semibold tracking-tight">Calificar</h1>
        <Alert>
          {v?.my_rating
            ? `Ya calificaste esta subasta (${v.my_rating.score} de 5).`
            : 'Solo el vendedor y el ganador pueden calificarse, una vez registrada la liquidación.'}
        </Alert>
      </section>
    )
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (score >= 1) mutation.mutate()
  }

  return (
    <section className="max-w-xl space-y-4">
      {back}
      <h1 className="text-2xl font-semibold tracking-tight">
        Calificar {v.is_owner ? 'al ganador' : 'al vendedor'}
      </h1>
      <p className="text-sm text-muted-foreground">{detail.data!.title ?? 'Subasta'}</p>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Puntuación</legend>
          <div className="flex gap-1" role="radiogroup" aria-label="Puntuación">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={score === n}
                aria-label={`${n} de 5: ${SCORE_LABEL[n]}`}
                onClick={() => setScore(n)}
                className={`text-3xl leading-none ${n <= score ? 'text-amber-500' : 'text-muted-foreground/40'}`}
              >
                ★
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {score ? SCORE_LABEL[score] : 'Elige de 1 a 5 estrellas.'}
          </p>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="rating-comment">Comentario (opcional)</Label>
          <Textarea
            id="rating-comment"
            rows={3}
            maxLength={COMMENT_MAX}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {comment.length}/{COMMENT_MAX}. La puntuación suma a la reputación pública de la otra
            parte.
          </p>
        </div>
        {mutation.isError && <ErrorAlert error={mutation.error} title="No se pudo calificar" />}
        <Button type="submit" disabled={score < 1 || mutation.isPending}>
          {mutation.isPending ? 'Enviando…' : 'Enviar calificación'}
        </Button>
      </form>
    </section>
  )
}
