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
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_TONE[status],
      )}
    >
      {STATUS_LABEL[status] ?? status}
      {resultPending && status === 'closed' ? ' · resultado pendiente' : ''}
    </span>
  )
}
