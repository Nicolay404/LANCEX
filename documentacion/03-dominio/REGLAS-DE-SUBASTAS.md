# Reglas del dominio de subastas

**Estado:** aprobadas (2026-10-11). Son la especificación que implementan las políticas de `backend/apps/auctions/domain/`. Cualquier cambio requiere PR con pruebas de regresión y actualización de este documento. Arquitectura del motor: [ADR-0005](../01-arquitectura/decisiones/ADR-0005-MOTOR-DE-SUBASTAS.md).

## 0. Conceptos

- **Mecanismo de competencia:** `ascending`, `reverse`, `sealed`.
- **Política de cierre:** `fixed`, `soft_close`, `candle`.
- **Capacidad:** `proxy_enabled` (solo con `ascending`).
- Combinaciones permitidas: ver la matriz de ADR-0005.
- **Estado efectivo:** se calcula con la hora de PostgreSQL; ver ADR-0005.

## 1. Reglas transversales

| Tema | Regla |
|---|---|
| Moneda | Solo **USD**. `currency = 'USD'` fijo en todas las subastas. |
| Precisión | Importes con **2 decimales** (`numeric(12,2)`). Precio unitario en inversa con hasta 4 decimales. Un importe con más decimales se rechaza (`INVALID_AMOUNT_PRECISION`), no se redondea en silencio. |
| Redondeo de cálculos | `ROUND_HALF_UP` a 2 decimales (solo para totales calculados por el servidor). |
| Rango | 0.01 ≤ importe ≤ 999 999 999.99. |
| Impuestos | Todos los importes se expresan **sin IVA**. La interfaz lo indica. |
| Hora | Siempre la de PostgreSQL. El cliente nunca envía horas de aceptación ni de cierre efectivo. |
| Duración | `ends_at − starts_at` entre **2 minutos** (demos) y **30 días**. |
| Inicio | Si al publicar `starts_at` ya pasó, se ajusta a la hora de publicación. |
| Autopuja | El dueño de la subasta (o miembros de su organización) **no** puede pujar ni ofertar en ella (`BID_ON_OWN_AUCTION`). |
| Reglas congeladas | Al publicar se guarda `rules_snapshot`; desde ese momento no se edita ningún parámetro (`RULES_LOCKED`). Solo título y descripción pueden corregirse mientras esté `scheduled`, y queda auditado. |
| Idempotencia | Toda puja/oferta lleva `Idempotency-Key`. Reintento = misma respuesta. |
| Orden | El orden oficial es `seq` por subasta. Todos los empates se resuelven a favor del `seq` menor (llegó antes). |
| Reserva | `reserve_price` opcional y privado. Si el precio final no la alcanza, `outcome = unsold`. Públicamente solo se muestra `reserve_met: true/false` (y solo si hay reserva). |
| Sin ofertas | Cierre con `outcome = unsold`. |

## 2. Subasta ascendente (`ascending`)

**Parámetros:** `starting_price` (≥ 1.00), `min_increment` (≥ 0.01), `reserve_price` opcional (≥ `starting_price`), `starts_at`, `ends_at`, `closing_policy`, `proxy_enabled`.

**Validez de una puja manual de importe `X`:**

1. Estado efectivo `active` (`AUCTION_NOT_ACTIVE`).
2. Si no hay pujas: `X ≥ starting_price`. Si hay: `X ≥ current_price + min_increment` (`BID_BELOW_MINIMUM`, con `details.minimum_allowed`).
3. El postor no es el líder actual (`ALREADY_LEADING`). Para subir su techo, el líder usa proxy.
4. El postor no es el dueño (`BID_ON_OWN_AUCTION`).

**Resultado:** gana la puja válida con mayor importe (que por construcción es la de mayor `seq` válida). Si dos pujas válidas tienen el mismo importe (solo ocurre en el empate de proxy `Cc = M_L`), gana la de mayor `seq`: es la respuesta automática del líder, cuyo límite llegó antes (§3). Aclaración del 2026-10-11, con prueba de regresión en `tests/auctions/test_domain_proxy_soft_close.py`. Precio final = su importe. Se aplica la reserva.

## 3. Proxy bidding (capacidad de `ascending`)

- Cada usuario tiene como máximo **un** límite activo por subasta (`proxy_bid_limit`).
- El límite inicial debe ser ≥ mínimo permitido de la siguiente puja. Solo se puede **subir**, nunca bajar (`PROXY_LIMIT_DECREASE_NOT_ALLOWED`). El líder no puede cancelarlo; un no líder sí.
- **Invariante:** en todo momento, como máximo un límite está "vivo" por encima del precio actual: el del líder. Los demás quedan `exhausted`.

**Algoritmo** (el retador C llega con capacidad `Cc`: `X` si es manual o `M_C` si es proxy; el líder L tiene capacidad `M_L` = su límite proxy, o el precio actual si no tiene proxy; `inc` = `min_increment`):

```text
si Cc > M_L:
    si L tiene proxy y M_L > precio_actual: registrar puja automática de L por M_L
    C pasa a ser líder
    precio := X                          si C es manual
    precio := min(M_C, M_L + inc)        si C es proxy
    registrar puja de C por precio (source = manual | proxy)
si Cc ≤ M_L:
    registrar puja de C por Cc           (si C es proxy, su límite queda exhausted)
    L sigue como líder
    precio := min(M_L, Cc + inc)
    registrar puja automática de L por precio (source = proxy)
    (empate Cc = M_L: gana L, que llegó antes, a precio M_L)
```

- Las pujas automáticas se registran como `source = 'proxy'` y nunca revelan el límite.
- Todo ocurre dentro de la misma transacción de `place_bid` (ADR-0005).
- Casos de prueba obligatorios: límite nunca excedido; dos límites iguales → gana el primero; manual contra proxy superior; proxy contra proxy; subida de límite del líder sin generar puja; límite de un no líder agotado.

## 4. Soft close / anti-sniping (`soft_close`)

**Parámetros:** `soft_close_window_s` (30 a 600, por defecto 120), `soft_close_extension_s` (30 a 600, por defecto 120), `soft_close_max_total_s` (por defecto 3600).

- Si una puja se acepta cuando faltan menos de `window` segundos para `ends_at`, entonces `ends_at := accepted_at + extension`.
- La suma de extensiones no supera `max_total` desde el `ends_at` original (terminación garantizada).
- Cada extensión incrementa `version` y genera `audit_event('auction_extended')`.

## 5. Cierre por vela (`candle`)

Política de cierre aleatorio verificable con commit-reveal. Solo con `ascending`.

**Parámetros:** `candle_window_s` (300 a 3600, por defecto 600). Ventana de vela = `[ends_at − candle_window_s, ends_at]`.

**Al publicar:**

```python
seed       = secrets.token_bytes(32)                          # secreto hasta el cierre
commitment = hashlib.sha256(seed).hexdigest()                 # público desde la publicación
offset_ms  = int.from_bytes(hmac.new(seed, auction_id.bytes, "sha256").digest()[:8], "big") % (candle_window_s * 1000)
candle_close_at = window_start + timedelta(milliseconds=offset_ms)   # secreto hasta el cierre
```

**Durante la subasta:**

- Las pujas se aceptan normalmente hasta `ends_at`. La interfaz advierte en la ventana de vela: *"la subasta pudo haber terminado ya; el instante real se revela al cierre"*.
- El precio mostrado durante la ventana es **provisional**.

**Al cerrar (en `ends_at`):**

- Solo cuentan las pujas con `accepted_at ≤ candle_close_at` (cierre retroactivo, como la vela histórica).
- Ganador = puja válida con mayor `seq` dentro de ese corte. Se aplica la reserva.
- Se revela `seed` y `candle_close_at`. Cualquiera puede verificar que `sha256(seed) == commitment` y recalcular el instante. El repositorio incluye `scripts/verify_candle.py`.
- Las pujas posteriores al instante quedan en el historial marcadas `counted = false`.

**Límite de la garantía (declararlo en la presentación):** el esquema prueba que el instante quedó fijado antes de recibir ofertas y no se manipuló después. No impide que alguien con acceso a la base lea la semilla antes de tiempo; por eso `candle_seed` nunca se serializa y solo `lancex_app` la lee.

## 6. Sobre cerrado (`sealed`, primer precio)

**Parámetros:** `starting_price` (oferta mínima), `reserve_price` opcional, `starts_at`, `ends_at`. Solo cierre `fixed`.

- Cada participante tiene **una oferta vigente**. Puede **editarla** (la nueva versión reemplaza a la anterior, que se conserva con `is_current = false`) o **retirarla** hasta `ends_at`.
- Oferta válida: estado efectivo `active`, importe ≥ `starting_price`, no es el dueño.
- Durante la recepción nadie, ni el dueño, ve importes ajenos ni el número de ofertas por persona. Se muestra solo el **número total de participantes con oferta vigente**.
- **Cierre:** revelación automática (no la dispara el dueño, para evitar elegir el momento). Gana la oferta vigente más alta; empate → `seq` menor de la versión vigente (editar hace perder prioridad). Precio = la propia oferta ganadora. Se aplica la reserva.
- Tras el cierre: el dueño ve todas las ofertas con identidad; cada participante ve el ranking con importes y seudónimos, y su posición; el público ve precio final y número de ofertas.

## 7. Subasta inversa B2B (`reverse`)

Una **organización compradora** publica una necesidad (`procurement_request`) y **organizaciones proveedoras** compiten a la baja.

**Parámetros:** `reference_budget` (presupuesto referencial = tope máximo del total), `min_decrement` (≥ 0.01), `quantity` (> 0, hasta 3 decimales), `unit` (texto corto: `unidad`, `kg`, `servicio`, ...), especificaciones, lista de `mandatory_requirements` (`[{code, description}]`), `delivery_deadline`, `starts_at`, `ends_at`, cierre `fixed` o `soft_close`.

**Fases:**

1. **Inscripción** (estado `scheduled`): un miembro de una organización proveedora **verificada** inscribe a su organización (`auction_participant`), declarando el cumplimiento de cada requisito obligatorio (`cumple: bool`, comentario).
2. **Calificación** (antes de `starts_at`): la organización compradora marca cada inscrita como `admitted` o `rejected` con motivo. En `starts_at` la calificación se congela; las no calificadas quedan `rejected` automáticamente con motivo `not_reviewed`.
3. **Puja a la baja** (estado `active`): solo proveedores `admitted`.

**Oferta de proveedor:** envía `unit_price` (hasta 4 decimales) y `shipping_cost` (2 decimales). El servidor calcula:

```text
total = ROUND_HALF_UP(unit_price × quantity + shipping_cost, 2)
```

Validez: `total ≤ reference_budget`; si ya hay ofertas, `total ≤ mejor_total − min_decrement` (`OFFER_ABOVE_MAXIMUM`, con `details.maximum_allowed`); el proveedor no es el líder actual (`ALREADY_LEADING`); su organización está `admitted` (`NOT_ADMITTED`).

**Resultado:** gana el menor total (la oferta válida de mayor `seq`). Sin ofertas → `unsold` (subasta "desierta"). La reserva no aplica (su papel lo cumple `reference_budget`).

**Visibilidad durante la puja:** proveedores ven el mejor total vigente y si van ganando, sin identidades; el comprador ve los totales con proveedores seudonimizados. Identidades reveladas al comprador al cerrar.

**Alcance legal:** LANCEX simula un proceso de compra entre privados. No es un sistema de contratación pública ni sustituye a SERCOP; la interfaz lo indica.

## 8. Organizaciones (B2B)

- Cualquier usuario puede crear una organización: `legal_name`, `ruc` (13 dígitos, formato validado), `is_buyer`, `is_supplier`. Quien la crea es `owner`.
- El `owner` agrega miembros existentes por email con rol `member`. Solo miembros activos actúan en nombre de la organización.
- Un moderador (o admin) la marca `verified` o `rejected` con nota. Solo organizaciones `verified` crean subastas inversas o se inscriben como proveedoras.
- No se suben documentos legales (fuera de alcance por privacidad).

## 9. Cancelación

| Quién | Cuándo puede cancelar |
|---|---|
| Dueño | `draft` y `scheduled` siempre; `active` solo si `bid_count = 0` y no hay ofertas selladas ni de proveedores vigentes. |
| Moderador o admin | Cualquier estado excepto `closed`, con `reason` obligatorio. |
| Nadie | Una subasta `closed`. |

Toda cancelación genera auditoría y notifica a participantes y seguidores.

## 10. Después del cierre

- `awarded`: ganador y dueño ven el nombre visible y el email del otro (sección "contacto"). LANCEX **no** procesa pagos ni envíos.
- El dueño marca `settlement_status`: `pending` → `completed` o `failed` (con comentario).
- **Reputación:** con `settlement_status` final, comprador y vendedor pueden calificarse una vez (1 a 5 y comentario de hasta 300 caracteres). La reputación pública de un usuario es el promedio y el número de calificaciones recibidas.

## 11. Seguimiento y notificaciones internas

- **Watchlist:** cualquier usuario autenticado sigue o deja de seguir una subasta pública.
- **Notificaciones** (tabla `notification`, leídas por polling): `outbid`, `auction_won`, `auction_lost`, `auction_closed_owner`, `auction_unsold_owner`, `auction_cancelled`, `participant_admitted`, `participant_rejected`, `watch_auction_started`, `watch_auction_ending` (10 minutos antes del fin en subastas `fixed`), `rating_received`, `report_resolved` (al reportante, sin detalles de la acción, según FUNCIONAMIENTO-DEL-SISTEMA.md), `organization_verified` y `organization_rejected` (a los owners, con la nota).
- Se crean en la misma transacción del evento que las causa (o en el job de cierre); nunca contienen máximos proxy ni importes sellados no revelados.

## 12. Catálogo de auditoría (`audit_event.action`)

`user_registered`, `organization_created`, `organization_updated`, `organization_member_added`, `organization_verified`, `organization_rejected`, `auction_created`, `auction_draft_updated`, `auction_published`, `auction_text_corrected`, `auction_cancelled`, `auction_extended`, `bid_accepted` (incluye `source`), `proxy_limit_set`, `proxy_limit_raised`, `sealed_offer_submitted`, `sealed_offer_updated`, `sealed_offer_withdrawn` (sin importes), `participant_registered`, `participant_admitted`, `participant_rejected`, `supplier_offer_accepted`, `auction_closed` (con `outcome`, ganador y precio final), `sealed_offers_revealed`, `candle_revealed`, `settlement_updated`, `rating_submitted`, `user_suspended`, `user_reactivated`, `user_role_changed`, `report_created`, `report_resolved`, `organization_ownership_transferred`, `organization_member_revoked`, `category_changed`, `security_password_changed`, `admin_action`.

Las pujas **rechazadas** no van a auditoría: se registran como log técnico `WARNING` en Firestore con su `error_code`.

## 13. Cuentas, límites y actividad

| Tema | Regla |
|---|---|
| Registro | Un email = una cuenta. Contraseña de 10 caracteres o más, validadores de Django. Nombre visible de 3 a 60 caracteres, sin URLs. |
| Cuentas de staff | `moderator` y `admin` no compran, no venden ni pertenecen a organizaciones (`ROLES-Y-PERMISOS.md` §2). |
| Suspensión | Efectos sobre operaciones en curso en `ROLES-Y-PERMISOS.md` §7. |
| Eliminación | No se eliminan cuentas con historial (las pujas son evidencia de resultados). Se suspenden. |
| Cambio de contraseña | Exige la contraseña actual y cierra las demás sesiones del usuario. |
| Publicaciones | Máximo 50 publicaciones por usuario; 6 imágenes por publicación; formatos JPEG, PNG y WebP (SVG prohibido). |
| Subastas abiertas | Máximo 10 subastas no terminales (`draft`, `scheduled`, `active`) por usuario y 10 por organización (`LIMIT_REACHED`). |
| Relanzamiento | Una publicación con subasta `unsold` o `cancelled` puede subastarse de nuevo en una subasta nueva. |
| Irrevocabilidad | Las pujas ascendentes y las ofertas inversas **no se retiran**. Solo la oferta sellada puede retirarse antes del cierre. |
| Ritmo | Además del throttling, un mismo usuario no puede registrar más de 1 puja manual por segundo en la misma subasta (`RATE_LIMITED`). |

## 14. Contenido prohibido y reportes

- Artículos prohibidos (publicados en `/ayuda/prohibidos`): armas y municiones, drogas y medicamentos con receta, animales vivos, documentos oficiales o de identidad, productos falsificados, datos personales, servicios ilegales, contenido sexual. Publicarlos es causa de cancelación y suspensión.
- Cualquier usuario con `report.create` reporta una subasta, publicación o usuario con motivo: `fraud`, `prohibited_item`, `misleading`, `other`, y detalle de hasta 500 caracteres. Máximo 10 reportes por usuario al día y uno por objeto.
- Un moderador resuelve: `dismissed` o `actioned` (cancelación o suspensión), siempre con nota. Toda resolución se audita.

## 15. Organizaciones: reglas adicionales

- Siempre debe existir al menos un `owner` activo. Para retirarse, el último `owner` transfiere la propiedad primero.
- Cambiar razón social o RUC de una organización verificada la devuelve a `pending`.
- Revocar a un miembro no afecta lo que hizo en nombre de la organización; solo le impide actuar desde ese momento.
- Una organización no puede ser compradora y proveedora en la misma subasta; un usuario miembro de la compradora no puede inscribir a una proveedora en esa subasta (`CONFLICT_OF_INTEREST`).
