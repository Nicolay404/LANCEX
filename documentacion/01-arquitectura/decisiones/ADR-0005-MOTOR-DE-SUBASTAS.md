# ADR-0005: Motor de subastas (Strategy, máquina de estados, concurrencia y cierre perezoso)

- **Estado:** aceptada.
- **Fecha:** 2026-10-11.
- **Decisores:** equipo LANCEX.

## Contexto

LANCEX soporta tres mecanismos de competencia (ascendente, inversa, sobre cerrado), tres políticas de cierre (fija, soft close, vela) y una capacidad combinable (proxy bidding). Si cada combinación se programa con `if` dentro de las vistas, el sistema se vuelve imposible de probar y de extender. Además, tres backends locales escriben sobre la misma base al mismo tiempo.

## Decisión 1: núcleo de dominio puro + Strategy por mecanismo

Las reglas viven en Python puro (sin importar Django) dentro de `backend/apps/auctions/domain/`. Los servicios de aplicación cargan datos con el ORM, llaman a la política y persisten el resultado dentro de una transacción.

```python
# backend/apps/auctions/domain/mechanisms/base.py
from typing import Protocol

class Mechanism(Protocol):
    code: str                                   # "ascending" | "reverse" | "sealed"
    def validate_config(self, cfg: AuctionConfig) -> list[RuleViolation]: ...
    def validate_bid(self, state: AuctionState, intent: BidIntent, now: datetime) -> Decision: ...
    def apply_bid(self, state: AuctionState, intent: BidIntent, now: datetime) -> BidOutcome: ...
    def select_winner(self, state: AuctionState, bids: Sequence[BidRecord]) -> Outcome: ...

class ClosingPolicy(Protocol):
    code: str                                   # "fixed" | "soft_close" | "candle"
    def effective_end(self, state: AuctionState) -> datetime: ...
    def on_bid_accepted(self, state: AuctionState, accepted_at: datetime) -> AuctionState: ...
    def bid_counts_for_result(self, state: AuctionState, bid: BidRecord) -> bool: ...

MECHANISMS: dict[str, Mechanism] = {"ascending": Ascending(), "reverse": Reverse(), "sealed": SealedFirstPrice()}
CLOSING_POLICIES: dict[str, ClosingPolicy] = {"fixed": Fixed(), "soft_close": SoftClose(), "candle": Candle()}
```

- `ProxyBidding` es un **decorador** sobre `Ascending`: intercepta `apply_bid` para generar las pujas automáticas.
- Agregar un mecanismo nuevo = una clase nueva + registro + esquema de configuración + pruebas. **Sin tocar** vistas, servicio de pujas ni modelos comunes (escenario de calidad QA-06).

### Matriz de compatibilidad (validada al crear y al publicar)

| Mecanismo | `fixed` | `soft_close` | `candle` | `proxy_enabled` |
|---|---|---|---|---|
| `ascending` | ✅ | ✅ | ✅ | ✅ |
| `reverse` | ✅ | ✅ | ❌ | ❌ |
| `sealed` | ✅ | ❌ | ❌ | ❌ |

Error al violar la matriz: `MECHANISM_COMBINATION_NOT_ALLOWED`.

## Decisión 2: máquina de estados con estado efectivo

Estados persistidos (`auction.status`): `draft`, `scheduled`, `active`, `closed`, `cancelled`. Resultado (`auction.outcome`): `null`, `awarded`, `unsold`.

```text
draft ──publish──▶ scheduled ──(db_now ≥ starts_at)──▶ active ──(db_now ≥ effective_end)──▶ closed
  │                    │                                  │
  └──cancel──▶ cancelled ◀──cancel──┘          cancel solo si bid_count = 0 (o moderador con motivo)
```

- `publish` congela `rules_snapshot` y genera los datos de vela. Después de publicar, **ningún parámetro de reglas se puede editar** (`RULES_LOCKED`).
- `scheduled → active` y `active → closed` no esperan a un job: el **estado efectivo** se calcula en cada lectura y en cada puja:

```python
def effective_status(a: AuctionState, db_now: datetime) -> str:
    if a.status in ("draft", "cancelled", "closed"):
        return a.status
    if db_now < a.starts_at:
        return "scheduled"
    if db_now < closing_policy(a).effective_end(a):
        return "active"
    return "closed"          # aunque el job todavía no haya materializado el resultado
```

- **Cierre perezoso:** si una lectura detecta `effective_status == "closed"` y `status != "closed"`, la API responde con estado `closed` y `result_pending = true`. El cierre real (ganador, `outcome`, revelación, auditoría, notificaciones) lo materializa `close_due_auctions` o, como respaldo, la primera llamada a `GET /result/`, ejecutando el mismo servicio idempotente `close_auction(auction_id)`.

## Decisión 3: concurrencia y orden de las pujas

Servicio `place_bid` (todas las modalidades usan el mismo esqueleto):

```text
BEGIN (READ COMMITTED)
  1. SELECT ... FROM lancex.auction WHERE id = :id FOR UPDATE      -- serializa por subasta
  2. now := clock_timestamp()                                      -- reloj de PostgreSQL
  3. Si existe bid con (auction_id, bidder_id, idempotency_key): devolver ese resultado (200) y salir
  4. effective_status(auction, now) debe ser "active"  → si no, AUCTION_NOT_ACTIVE
  5. Validaciones comunes: permisos, no es el dueño, admitido (inversa), importe > 0 y con 2 decimales
  6. mechanism.validate_bid(...)                       → error de dominio con código
  7. outcome := mechanism.apply_bid(...)               → 1..n pujas (manual + automáticas de proxy)
  8. INSERT bid(s) con seq = auction.bid_count + k
  9. closing_policy.on_bid_accepted(...)               → p. ej. extender ends_at (soft close)
 10. UPDATE auction SET current_price, leader_id, bid_count, ends_at, version = version + 1
 11. INSERT audit_event(s)
COMMIT
transaction.on_commit → log técnico + notificaciones
```

- `FOR UPDATE` sobre la fila de la subasta es suficiente con `READ COMMITTED`: dos pujas a la misma subasta se ejecutan una detrás de otra, y pujas a subastas distintas no se bloquean entre sí.
- **El orden oficial es `bid.seq`** (único por subasta), no el timestamp. Los desempates se resuelven por `seq` menor.
- `accepted_at` = `clock_timestamp()` dentro de la transacción, después del bloqueo.
- **Idempotencia:** cabecera `Idempotency-Key` (UUID v4 generado por el cliente por cada intento lógico de puja). Restricción única `(auction_id, bidder_id, idempotency_key)`. Un reintento devuelve la misma puja con `200` en lugar de `201`.
- Las ofertas selladas y las de proveedores usan el mismo esqueleto con sus tablas.

## Decisión 4: cierre idempotente

```text
close_due_auctions:
  SELECT id FROM lancex.auction
   WHERE status IN ('scheduled','active') AND <fin efectivo calculado en SQL> <= now()
   FOR UPDATE SKIP LOCKED LIMIT 50
  para cada id: close_auction(id)

close_auction(id):
  BEGIN; SELECT ... FOR UPDATE; si status = 'closed' → COMMIT y salir (idempotente)
  bids válidas := closing_policy.bid_counts_for_result(...)
  outcome := mechanism.select_winner(...)
  UPDATE auction SET status='closed', outcome, winner_id, final_price, closed_at = now(), version+1
  (vela) revelar semilla; (sellado) marcar ofertas como reveladas
  INSERT audit_event('auction_closed', ...); INSERT notification(...)
  COMMIT
```

`SKIP LOCKED` permite que los tres backends ejecuten el job a la vez sin bloquearse ni duplicar resultados.

## Decisión 5: estructura de módulos

```text
backend/apps/
├── accounts/         # User, sesión, registro, me
├── organizations/    # Organization, Membership (B2B)
├── catalog/          # Category, Listing, ListingImage, ProcurementRequest
├── auctions/
│   ├── domain/       # Python puro: mechanisms/, closing/, proxy.py, state.py, errors.py
│   ├── services/     # place_bid, publish, cancel, close_auction, submit_sealed, ...
│   ├── models.py     # managed = False
│   ├── api/          # serializers por audiencia (public/owner/participant), views, urls
│   └── management/commands/close_due_auctions.py
├── audit/            # AuditEvent + función record()
├── notifications/    # Notification + Watchlist
└── core/             # TimeSource (db_now), request_id middleware, logging Firestore, errores API
```

Regla de dependencias: `api → services → domain`; `domain` no importa nada de Django; ninguna app importa `api/` de otra.

## Consecuencias

- (+) Reglas probables con pruebas unitarias rápidas, sin base de datos.
- (+) Consistencia fuerte bajo concurrencia sin infraestructura adicional.
- (+) El sistema es correcto aunque ningún job de cierre esté corriendo.
- (-) Una subasta muy disputada serializa sus pujas; aceptable para el volumen previsto (escenario QA-05).
