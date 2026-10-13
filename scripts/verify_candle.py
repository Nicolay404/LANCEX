#!/usr/bin/env python3
"""Verifica una subasta de vela de LANCEX sin confiar en el servidor (REGLAS-DE-SUBASTAS.md §5).

Uso (datos de GET /api/v1/auctions/{id}/candle-proof/):

    python scripts/verify_candle.py --auction-id <uuid> --commitment <hex64> --seed-hex <hex64> \
        --window-start 2026-10-20T15:50:00+00:00 --window-s 600 --close-at 2026-10-20T15:53:12.345000+00:00

Comprueba: 1) sha256(seed) == commitment publicado al inicio; 2) el instante recalculado coincide.
Solo usa la biblioteca estándar de Python.
"""

import argparse
import hashlib
import hmac
import sys
import uuid
from datetime import datetime, timedelta


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--auction-id", required=True)
    parser.add_argument("--commitment", required=True)
    parser.add_argument("--seed-hex", required=True)
    parser.add_argument("--window-start", required=True)
    parser.add_argument("--window-s", type=int, required=True)
    parser.add_argument("--close-at", required=True)
    args = parser.parse_args()

    seed = bytes.fromhex(args.seed_hex)
    commitment_ok = hmac.compare_digest(hashlib.sha256(seed).hexdigest(), args.commitment.lower())

    digest = hmac.new(seed, uuid.UUID(args.auction_id).bytes, hashlib.sha256).digest()
    offset_ms = int.from_bytes(digest[:8], "big") % (args.window_s * 1000)
    expected = datetime.fromisoformat(args.window_start) + timedelta(milliseconds=offset_ms)
    instant_ok = expected == datetime.fromisoformat(args.close_at)

    print(f"Compromiso sha256(seed) coincide: {'SI' if commitment_ok else 'NO'}")
    print(f"Instante recalculado: {expected.isoformat()}  ({'coincide' if instant_ok else 'NO coincide'})")
    return 0 if commitment_ok and instant_ok else 1


if __name__ == "__main__":
    sys.exit(main())
