/**
 * Verificación del cierre por vela en el navegador (REGLAS §5, `scripts/verify_candle.py`):
 *
 *   commitment = sha256(seed)                                         (publicado al iniciar)
 *   offset_ms  = uint64_be(HMAC-SHA256(seed, auction_id.bytes)[:8]) % (window_s * 1000)
 *   close_at   = window_start + offset_ms                             (revelado al cierre)
 *
 * Las fechas del backend llevan MICROsegundos y `Date` solo milisegundos: todo se compara en
 * microsegundos con BigInt para no dar falsos "no coincide".
 */

export interface CandleProof {
  auction_id: string
  commitment: string
  seed_hex: string
  window_start: string
  window_s: number
  close_at: string
  algorithm?: string
}

export interface CandleCheck {
  computedCommitment: string
  commitmentOk: boolean
  /** Coincide con el compromiso que se mostró públicamente antes del cierre. */
  publishedOk: boolean | null
  expectedCloseAt: string
  instantOk: boolean
  ok: boolean
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase()
  if (!/^([0-9a-f]{2})+$/.test(clean)) throw new Error('Hexadecimal inválido')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** `uuid.UUID(x).bytes` de Python: los 16 bytes en orden big-endian. */
export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '')
  if (hex.length !== 32) throw new Error('UUID inválido')
  return hexToBytes(hex)
}

/** ISO-8601 (con zona) → microsegundos desde epoch, sin perder los microsegundos. */
export function isoToMicros(iso: string): bigint {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6})\d*)?(Z|[+-]\d{2}:\d{2})$/.exec(
    iso.trim(),
  )
  if (!m) throw new Error(`Fecha inválida: ${iso}`)
  const seconds = Date.parse(`${m[1]}${m[3]}`)
  if (!Number.isFinite(seconds)) throw new Error(`Fecha inválida: ${iso}`)
  return BigInt(seconds) * 1000n + BigInt((m[2] ?? '').padEnd(6, '0'))
}

/** Microsegundos → ISO UTC con 6 decimales (`2026-10-13T04:01:26.742836Z`). */
export function microsToIso(us: bigint): string {
  const ms = Number(us / 1000n)
  const micros = (us % 1_000_000n).toString().padStart(6, '0')
  return `${new Date(ms).toISOString().slice(0, 19)}.${micros}Z`
}

export async function verifyCandle(
  proof: CandleProof,
  publishedCommitment: string | null,
  subtle: SubtleCrypto = globalThis.crypto.subtle,
): Promise<CandleCheck> {
  const seed = hexToBytes(proof.seed_hex)
  const computedCommitment = bytesToHex(await subtle.digest('SHA-256', seed as BufferSource))
  const commitmentOk = computedCommitment === proof.commitment.trim().toLowerCase()
  const publishedOk =
    publishedCommitment === null
      ? null
      : publishedCommitment.trim().toLowerCase() === computedCommitment

  const key = await subtle.importKey(
    'raw',
    seed as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(
    await subtle.sign('HMAC', key, uuidToBytes(proof.auction_id) as BufferSource),
  )
  const first8 = new DataView(mac.buffer, mac.byteOffset, 8).getBigUint64(0, false)
  const offsetMs = first8 % BigInt(proof.window_s * 1000)
  const expected = isoToMicros(proof.window_start) + offsetMs * 1000n
  const instantOk = expected === isoToMicros(proof.close_at)

  return {
    computedCommitment,
    commitmentOk,
    publishedOk,
    expectedCloseAt: microsToIso(expected),
    instantOk,
    ok: commitmentOk && instantOk && publishedOk !== false,
  }
}
