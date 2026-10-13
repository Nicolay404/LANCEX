import { useEffect, useState } from 'react'

import { useServerOffset } from '@/lib/serverClock'

/** Milisegundos que faltan para `target` según la hora del SERVIDOR (NaN si no hay fecha). */
export function useRemaining(target: string | null): number {
  const offset = useServerOffset()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const targetMs = target ? Date.parse(target) : NaN
  return targetMs - (now + offset)
}

export function splitRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}
