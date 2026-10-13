import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import type { Uuid } from '@/api/types'
import { syncServerTime } from '@/lib/serverClock'

import { auctionKeys, fetchAuction, fetchLive, type LiveSnapshot } from './api'
import type { AuctionDetail, AuctionLive } from './types'

const POLL_MS = 2_000

function isLiveStatus(s: { status: string; result_pending: boolean } | undefined) {
  return !!s && (s.status === 'scheduled' || s.status === 'active' || s.result_pending)
}

/**
 * Detalle + polling de `live/` cada 2 s con ETag (ADR-0004 §4). Si cambia `version`
 * se vuelven a pedir el detalle y el historial. Sin polling con la pestaña oculta.
 */
export function useAuctionLive(id: Uuid) {
  const queryClient = useQueryClient()

  const detail = useQuery({
    queryKey: auctionKeys.detail(id),
    queryFn: async ({ signal }) => {
      const sentAt = Date.now()
      const data = await fetchAuction(id, signal)
      syncServerTime(data.server_time, (sentAt + Date.now()) / 2)
      return data
    },
  })

  const live = useQuery({
    queryKey: auctionKeys.live(id),
    queryFn: async ({ signal }) => {
      const previous = queryClient.getQueryData<LiveSnapshot>(auctionKeys.live(id))
      const sentAt = Date.now()
      const snap = await fetchLive(id, previous, signal)
      if (snap !== previous) syncServerTime(snap.live.server_time, (sentAt + Date.now()) / 2)
      return snap
    },
    enabled: detail.isSuccess,
    refetchInterval: (q) => {
      const current = q.state.data?.live ?? detail.data
      return isLiveStatus(current) ? POLL_MS : false
    },
    refetchIntervalInBackground: false,
  })

  const liveVersion = live.data?.live.version
  const detailVersion = detail.data?.version
  useEffect(() => {
    if (liveVersion !== undefined && detailVersion !== undefined && liveVersion > detailVersion) {
      void queryClient.invalidateQueries({ queryKey: auctionKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: auctionKeys.bids(id) })
    }
  }, [liveVersion, detailVersion, id, queryClient])

  return { detail, live: live.data?.live, merged: merge(detail.data, live.data?.live) }
}

/** El detalle con los campos frescos de `live/` (precio, estado, ends_at extendido...). */
function merge(d: AuctionDetail | undefined, l: AuctionLive | undefined) {
  if (!d) return undefined
  if (!l || l.version < d.version) {
    return { ...d, viewerIsLeader: d.viewer?.is_leader ?? false, liveVersion: d.version }
  }
  return {
    ...d,
    status: l.status,
    result_pending: l.result_pending,
    current_price: l.current_price,
    minimum_next_bid: l.minimum_next_bid,
    maximum_allowed: l.maximum_allowed,
    bid_count: l.bid_count,
    active_offer_count: l.active_offer_count,
    ends_at: l.ends_at,
    reserve_met: l.reserve_met,
    viewerIsLeader: l.viewer_is_leader,
    liveVersion: l.version,
  }
}

export type MergedAuction = NonNullable<ReturnType<typeof merge>>
