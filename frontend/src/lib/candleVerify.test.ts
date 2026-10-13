import { describe, expect, it } from 'vitest'

import {
  isoToMicros,
  microsToIso,
  uuidToBytes,
  verifyCandle,
  type CandleProof,
} from './candleVerify'

// Vector generado con el dominio real del backend (apps/auctions/domain/closing/candle.py).
const PROOF: CandleProof = {
  auction_id: '085df787-cdba-41ae-a639-e3aa53820cbb',
  commitment: '4773d12e2371bb935b9a0f5439b4a1c3ad3f2414b86980f8418d1cfabdfadfef',
  seed_hex: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
  window_start: '2026-10-13T03:55:27.616836+00:00',
  window_s: 600,
  close_at: '2026-10-13T04:01:26.742836+00:00',
}

describe('verificación de vela', () => {
  it('fechas con microsegundos sin pérdida', () => {
    expect(isoToMicros('2026-10-13T03:55:27.616836Z')).toBe(
      isoToMicros('2026-10-13T03:55:27.616836+00:00'),
    )
    expect(isoToMicros('2026-10-12T22:55:27.616836-05:00')).toBe(
      isoToMicros('2026-10-13T03:55:27.616836Z'),
    )
    expect(isoToMicros('2026-10-13T03:55:27Z') % 1_000_000n).toBe(0n)
    expect(microsToIso(isoToMicros('2026-10-13T04:01:26.742836+00:00'))).toBe(
      '2026-10-13T04:01:26.742836Z',
    )
    expect(uuidToBytes(PROOF.auction_id)[0]).toBe(0x08)
  })

  it('reproduce el compromiso y el instante del backend', async () => {
    const r = await verifyCandle(PROOF, PROOF.commitment)
    expect(r).toMatchObject({ commitmentOk: true, publishedOk: true, instantOk: true, ok: true })
    expect(r.expectedCloseAt).toBe('2026-10-13T04:01:26.742836Z')
  })

  it('detecta semilla alterada, instante alterado (1 µs) y compromiso publicado distinto', async () => {
    const badSeed = await verifyCandle(
      { ...PROOF, seed_hex: PROOF.seed_hex.replace(/^00/, '01') },
      PROOF.commitment,
    )
    expect(badSeed.commitmentOk).toBe(false)
    expect(badSeed.ok).toBe(false)
    const badInstant = await verifyCandle(
      { ...PROOF, close_at: '2026-10-13T04:01:26.742837+00:00' },
      PROOF.commitment,
    )
    expect(badInstant).toMatchObject({ commitmentOk: true, instantOk: false, ok: false })
    const otherPublished = await verifyCandle(PROOF, 'ab'.repeat(32))
    expect(otherPublished).toMatchObject({ publishedOk: false, ok: false })
  })
})
