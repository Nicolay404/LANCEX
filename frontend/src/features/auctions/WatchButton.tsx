import { useMutation, useQueryClient } from '@tanstack/react-query'

import { ErrorAlert } from '@/components/ErrorAlert'
import { Button } from '@/components/ui/button'

import { auctionKeys, unwatchAuction, watchAuction } from './api'
import type { AuctionDetail } from './types'

/** Seguir / dejar de seguir (PUT|DELETE idempotentes). Actualiza el detalle en caché al instante. */
export function WatchButton({ auctionId, watching }: { auctionId: string; watching: boolean }) {
  const queryClient = useQueryClient()
  const setWatching = (value: boolean) =>
    queryClient.setQueryData<AuctionDetail>(auctionKeys.detail(auctionId), (d) =>
      d && d.viewer ? { ...d, viewer: { ...d.viewer, watching: value } } : d,
    )
  const mutation = useMutation({
    mutationFn: (next: boolean) => (next ? watchAuction(auctionId) : unwatchAuction(auctionId)),
    onMutate: (next) => setWatching(next),
    onError: (_e, next) => setWatching(!next),
  })
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        aria-pressed={watching}
        disabled={mutation.isPending}
        onClick={() => mutation.mutate(!watching)}
      >
        {watching ? '★ Siguiendo' : '☆ Seguir subasta'}
      </Button>
      {mutation.isError && <ErrorAlert error={mutation.error} />}
    </div>
  )
}
