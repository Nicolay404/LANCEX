import { cn } from '@/lib/utils'

import { STATUS_LABEL, STATUS_TONE } from './labels'
import type { AuctionStatus } from './types'

export function StatusBadge({
  status,
  resultPending,
}: {
  status: AuctionStatus
  resultPending?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase',
        STATUS_TONE[status],
        status === 'active' && 'live-badge',
      )}
    >
      {status === 'active' && (
        <span aria-hidden className="relative size-1.5 rounded-full bg-white">
          <span className="absolute inset-0 animate-ping rounded-full bg-white opacity-60" />
        </span>
      )}
      {status === 'active' ? 'En vivo' : (STATUS_LABEL[status] ?? status)}
      {resultPending && status === 'closed' ? ' · pendiente' : ''}
    </span>
  )
}
