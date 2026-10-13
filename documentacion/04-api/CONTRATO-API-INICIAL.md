# Contrato de API v1

**Estado:** aprobado como contrato de trabajo (2026-10-11). Frontend y backend trabajan en paralelo contra este documento. El backend publica el esquema OpenAPI generado con drf-spectacular en `/api/v1/schema/` y el frontend genera tipos con `openapi-typescript`. Si el OpenAPI y este documento discrepan, se corrige en el mismo PR.

## Convenciones

- Base: `/api/v1/`. JSON en UTF-8. Nombres de campos en `snake_case`.
- Importes como **string decimal** (`"125.00"`), nunca número JSON.
- Fechas en ISO-8601 con zona (`"2026-10-12T15:00:00Z"`).
- Autenticación: cookie de sesión. Peticiones mutables con cabecera `X-CSRFToken`.
- Pujas y ofertas: cabecera `Idempotency-Key: <uuid v4>`.
- Todas las respuestas incluyen `X-Request-ID`.
- Paginación: `?page=1&page_size=20` (máximo 50). Respuesta: `{ "count", "next", "previous", "results": [] }`.
- Visibilidad: cada campo se serializa según la **matriz de visibilidad** (al final). Hay serializadores separados por audiencia: `Public`, `Participant`, `Owner`, `Moderation`. Ningún serializador usa `fields = "__all__"`.
- Entrada estricta: campos no documentados en el cuerpo → `400 UNKNOWN_FIELD` (ADR-0006).

## Errores

```json
{
  "code": "BID_BELOW_MINIMUM",
  "message": "La oferta no alcanza el mínimo permitido.",
  "details": { "minimum_allowed": "130.00" },
  "request_id": "6f1c2a..."
}
```

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Formato o campos inválidos (`details.fields`) |
| 400 | `INVALID_AMOUNT_PRECISION` | Más decimales de los permitidos |
| 400 | `UNKNOWN_FIELD` | El cuerpo incluye campos no permitidos para ese endpoint (`details.fields`); se registra como evento de seguridad |
| 400 | `MECHANISM_COMBINATION_NOT_ALLOWED` | Combinación fuera de la matriz |
| 401 | `AUTH_REQUIRED` | Sin sesión |
| 401 | `INVALID_CREDENTIALS` | Login fallido (mensaje genérico) |
| 403 | `FORBIDDEN` | Sin permiso sobre el objeto |
| 403 | `CSRF_FAILED` | Falta o no coincide el token CSRF |
| 403 | `BID_ON_OWN_AUCTION` | Dueño u organización dueña intenta pujar |
| 403 | `NOT_ADMITTED` | Proveedor no admitido en subasta inversa |
| 403 | `ORGANIZATION_NOT_VERIFIED` | Organización sin verificar |
| 403 | `CONFLICT_OF_INTEREST` | Participación prohibida por conflicto de interés |
| 403 | `ACCOUNT_SUSPENDED` | Login correcto de una cuenta suspendida |
| 403 | `STEP_UP_FAILED` | Contraseña de confirmación incorrecta en acción sensible |
| 404 | `NOT_FOUND` | No existe o no es visible para el usuario |
| 405 | `METHOD_NOT_ALLOWED` | Método HTTP no soportado por la ruta |
| 406 | `NOT_ACCEPTABLE` | `Accept` distinto de JSON |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Cuerpo que no es `application/json` |
| 409 | `AUCTION_NOT_ACTIVE` | Fuera de la ventana de pujas |
| 409 | `BID_BELOW_MINIMUM` | `details.minimum_allowed` |
| 409 | `OFFER_ABOVE_MAXIMUM` | Inversa: `details.maximum_allowed` |
| 409 | `ALREADY_LEADING` | El líder intenta superarse |
| 409 | `PROXY_LIMIT_DECREASE_NOT_ALLOWED` | Intento de bajar el máximo |
| 409 | `PROXY_NOT_ENABLED` | Se intenta fijar un máximo proxy en una subasta sin `proxy_enabled` |
| 409 | `MECHANISM_MISMATCH` | Operación de otro mecanismo (puja en sobre cerrado u oferta sellada en ascendente) |
| 409 | `RUC_ALREADY_REGISTERED` | Ya existe una organización con ese RUC |
| 409 | `ALREADY_MEMBER` | El usuario ya es miembro activo de la organización |
| 409 | `ALREADY_REGISTERED` | La organización ya está inscrita en esa subasta inversa |
| 409 | `PROCUREMENT_HAS_AUCTION` | La necesidad B2B ya tiene una subasta asociada |
| 409 | `NOT_REVEALED_YET` | `candle-proof` pedido antes del cierre de la subasta |
| 409 | `RULES_LOCKED` | Edición de reglas tras publicar |
| 409 | `LISTING_LOCKED` | Edición de una publicación con subasta no terminal (`draft`, `scheduled`, `active`) |
| 409 | `LISTING_HAS_OPEN_AUCTION` | La publicación ya tiene una subasta `draft`, `scheduled` o `active` |
| 409 | `INVALID_STATE_TRANSITION` | Publicar/cancelar en estado no permitido |
| 409 | `IDEMPOTENCY_CONFLICT` | Misma clave con distinto contenido |
| 409 | `LIMIT_REACHED` | Límite de publicaciones, subastas abiertas o reportes |
| 409 | `ALREADY_REPORTED` | El usuario ya reportó ese objeto |
| 409 | `LAST_OWNER` / `LAST_ADMIN` | Se intenta dejar sin propietario a una organización o sin admin a la plataforma |
| 409 | `EMAIL_ALREADY_REGISTERED` | Registro duplicado |
| 429 | `RATE_LIMITED` | Throttling o login bloqueado 15 min tras 5 fallos por email (`details.retry_after_s`) |
| 500 | `INTERNAL_ERROR` | Error no controlado (sin detalles internos) |

Nunca se incluyen datos privados de otros usuarios en `details`.

## Endpoints

Leyenda de acceso: **P** público, **A** usuario autenticado con rol `user`, **D** dueño de la subasta/recurso, **M** miembro de organización, **MOD** moderador o admin, **ADM** solo admin. La capacidad exacta de cada endpoint está en `tests/security/endpoint_matrix.yaml` y en `03-dominio/ROLES-Y-PERMISOS.md`. Todo endpoint no listado no existe.

### Autenticación y cuenta

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/auth/csrf/` | P | Establece cookie `csrftoken`. `204` |
| POST | `/auth/register/` | P | `{email, password, display_name}` → `201` + sesión iniciada |
| POST | `/auth/login/` | P | `{email, password}` → `200` `UserMe` |
| POST | `/auth/logout/` | sesión | `204`; borra la sesión |
| GET | `/auth/me/` | sesión | `UserMe` |
| PATCH | `/auth/me/` | sesión | Solo `{display_name}`; cualquier otro campo → `UNKNOWN_FIELD` |
| POST | `/auth/password/` | sesión | `{current_password, new_password}`; cierra las demás sesiones |
| GET | `/users/{id}/` | P | Perfil público: `display_name`, reputación |

`UserMe` (única fuente para construir la interfaz; ADR-0006):

```json
{
  "id": "uuid",
  "email": "ana@example.com",
  "display_name": "Ana",
  "platform_role": "user",
  "capabilities": ["catalog.view", "account.manage_own", "bid.place", "listing.manage_own", "..."],
  "organizations": [
    { "id": "uuid", "legal_name": "Insumos Loja S.A.", "role": "owner", "verification_status": "verified",
      "is_buyer": true, "is_supplier": false,
      "capabilities": ["org.view", "org.manage_members", "procurement.manage", "auction.create_reverse"] }
  ],
  "server_time": "2026-10-12T15:00:00Z"
}
```

### Organizaciones

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/organizations/` | A | Crear (`legal_name`, `ruc`, `is_buyer`, `is_supplier`); el creador es `owner` |
| GET | `/organizations/{id}/` | M | Detalle y miembros |
| POST | `/organizations/{id}/members/` | M (owner) | `{email}` de usuario existente |
| DELETE | `/organizations/{id}/members/{user_id}/` | M (owner) | Revocar (`LAST_OWNER` si aplica) |
| PATCH | `/organizations/{id}/` | M (owner) | `{legal_name, ruc, is_buyer, is_supplier}`; cambiar razón social o RUC vuelve a `pending` |
| POST | `/organizations/{id}/transfer-ownership/` | M (owner) | `{new_owner_user_id, password}` (step-up) |

### Catálogo y publicaciones

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/categories/` | P | Lista |
| POST | `/listings/` | A | Crear artículo |
| GET/PATCH | `/listings/{id}/` | D | Editar solo si no tiene subasta publicada |
| POST | `/listings/{id}/images/upload-url/` | D | `{content_type, size_bytes}` → `{upload_url, storage_path, expires_in}` |
| POST | `/listings/{id}/images/` | D | Confirmar `{storage_path, position}` |
| DELETE | `/listings/{id}/images/{image_id}/` | D | Solo sin subasta publicada |
| POST | `/procurement-requests/` | M (compradora verificada) | Crear necesidad B2B |
| GET | `/procurement-requests/{id}/` | P | Detalle público |

### Subastas

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/auctions/` | P | Catálogo. Filtros: `status` (efectivo), `mechanism`, `category`, `q`, `ending_soon=true`, `mine=owner\|participating\|watching` (A). Orden: `ends_at`, `-created_at`, `current_price` |
| POST | `/auctions/` | A / M | Crear en `draft` (ver payload) |
| GET | `/auctions/{id}/` | P | Detalle según audiencia (matriz) |
| PATCH | `/auctions/{id}/` | D | Solo en `draft`; en `scheduled` solo textos |
| POST | `/auctions/{id}/publish/` | D | `draft → scheduled`; congela reglas; devuelve `candle_commitment` si aplica |
| POST | `/auctions/{id}/cancel/` | D | `{reason}` (moderadores usan `/moderation/auctions/{id}/cancel/`) |
| GET | `/auctions/{id}/live/` | P | Estado mínimo para polling; soporta `If-None-Match` → `304` |
| GET | `/auctions/{id}/bids/` | P | Historial visible (seudónimos); vacío en `sealed` antes del cierre |
| POST | `/auctions/{id}/bids/` | A | Puja manual ascendente `{amount}` o inversa `{unit_price, shipping_cost}` |
| GET/PUT | `/auctions/{id}/proxy-limit/` | A | Ver o fijar/subir el máximo propio `{max_amount}` |
| GET | `/auctions/{id}/sealed-offer/` | A | Mi oferta vigente |
| PUT | `/auctions/{id}/sealed-offer/` | A | Crear o reemplazar `{amount}` |
| DELETE | `/auctions/{id}/sealed-offer/` | A | Retirar |
| POST | `/auctions/{id}/participants/` | M (proveedora verificada) | Inscribirse `{organization_id, compliance: [...]}` |
| GET | `/auctions/{id}/participants/` | D / M | Dueño: todos; proveedor: su inscripción |
| POST | `/auctions/{id}/participants/{pid}/decision/` | D | `{status: admitted\|rejected, reason}` |
| GET | `/auctions/{id}/result/` | P | Resultado según audiencia; materializa el cierre si está pendiente |
| GET | `/auctions/{id}/candle-proof/` | P | Tras el cierre: `{commitment, seed_hex, window_start, window_s, close_at}` |
| PATCH | `/auctions/{id}/settlement/` | D | `{settlement_status, settlement_note}` |
| POST | `/auctions/{id}/rating/` | ganador o dueño | `{score, comment}` |
| PUT/DELETE | `/auctions/{id}/watch/` | A | Seguir / dejar de seguir |

### Reportes

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/reports/` | A | `{target_type, target_id, reason, detail}` |

### Moderación

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/moderation/summary/` | MOD | Contadores de la bandeja |
| GET | `/moderation/organizations/?status=pending` | MOD | Organizaciones por verificar |
| POST | `/moderation/organizations/{id}/decision/` | MOD | `{status: verified\|rejected, note}` |
| GET | `/moderation/reports/?status=open` | MOD | Reportes |
| POST | `/moderation/reports/{id}/resolve/` | MOD | `{status: dismissed\|actioned, note, action: none\|cancel_auction\|suspend_user}` |
| GET | `/moderation/auctions/{id}/` | MOD | Vista interna: pujas con identidades y auditoría de la subasta (sin máximos proxy ni sellados no revelados) |
| POST | `/moderation/auctions/{id}/cancel/` | MOD | `{reason}` |
| GET | `/moderation/users/{id}/` | MOD | Ficha: actividad y reportes |
| POST | `/moderation/users/{id}/suspend/` | MOD | `{reason}`; solo admin suspende a un moderador |

### Administración

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/admin/users/?q=&role=&status=` | ADM | Búsqueda de usuarios |
| POST | `/admin/users/{id}/reactivate/` | ADM | `{reason}` |
| POST | `/admin/users/{id}/role/` | ADM | `{platform_role, reason, password}` (step-up; `LAST_ADMIN`) |
| GET/POST/PATCH | `/admin/categories/` | ADM | Crear, renombrar, activar/desactivar |
| GET | `/admin/audit-events/?auction_id=&actor_id=&action=&from=&to=` | ADM | Consulta de auditoría |
| GET | `/admin/system-health/` | ADM | `job_heartbeat`, cierres pendientes, conteos |

### Notificaciones

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/notifications/?unread=true` | A | Lista paginada |
| POST | `/notifications/read/` | A | `{ids: [...]}` o `{all: true}` |
| GET | `/schema/` | P (solo `DEBUG`) | OpenAPI |

## Payloads clave

**Crear subasta ascendente:**

```json
{
  "mechanism": "ascending",
  "closing_policy": "soft_close",
  "proxy_enabled": true,
  "listing_id": "uuid",
  "starting_price": "100.00",
  "min_increment": "5.00",
  "reserve_price": "150.00",
  "starts_at": "2026-10-20T15:00:00Z",
  "ends_at": "2026-10-21T15:00:00Z",
  "soft_close_window_s": 120,
  "soft_close_extension_s": 120
}
```

**Crear subasta inversa:**

```json
{
  "mechanism": "reverse",
  "closing_policy": "fixed",
  "organization_id": "uuid-compradora",
  "procurement_request_id": "uuid",
  "reference_budget": "12000.00",
  "min_decrement": "50.00",
  "starts_at": "2026-10-25T14:00:00Z",
  "ends_at": "2026-10-25T16:00:00Z"
}
```

**Detalle público (`GET /auctions/{id}/`):**

```json
{
  "id": "uuid",
  "mechanism": "ascending",
  "closing_policy": "candle",
  "proxy_enabled": true,
  "status": "active",
  "result_pending": false,
  "title": "Laptop Lenovo ThinkPad T14",
  "description": "...",
  "category": { "id": 2, "name": "Tecnología" },
  "images": [{ "url": "https://...firmada", "position": 0 }],
  "seller": { "id": "uuid", "display_name": "Ana", "rating_avg": "4.8", "rating_count": 12 },
  "currency": "USD",
  "starting_price": "100.00",
  "min_increment": "5.00",
  "current_price": "135.00",
  "minimum_next_bid": "140.00",
  "bid_count": 7,
  "has_reserve": true,
  "reserve_met": false,
  "starts_at": "...", "ends_at": "...",
  "candle": { "window_start": "...", "commitment": "a3f9..." },
  "server_time": "2026-10-12T15:04:12.381Z",
  "version": 42,
  "viewer": { "is_owner": false, "is_leader": true, "watching": true, "my_proxy_max": "200.00" }
}
```

`viewer` solo aparece con sesión y contiene únicamente datos del propio usuario. `server_time` (hora de PostgreSQL) permite al frontend calcular la cuenta regresiva sin fiarse del reloj local.

**Polling (`GET /auctions/{id}/live/`):**

```json
{ "version": 42, "status": "active", "result_pending": false, "current_price": "135.00",
  "minimum_next_bid": "140.00", "bid_count": 7, "active_offer_count": null, "ends_at": "...",
  "reserve_met": false, "server_time": "...", "viewer_is_leader": true }
```

**Respuesta a una puja aceptada (`201`, o `200` si es reintento idempotente):**

```json
{ "bid": { "seq": 8, "amount": "140.00", "source": "manual", "accepted_at": "..." },
  "auction": { "current_price": "145.00", "viewer_is_leader": false, "version": 44, "ends_at": "..." },
  "outbid_by_proxy": true }
```

`outbid_by_proxy: true` indica que un máximo proxy ajeno respondió en la misma transacción, sin revelar el máximo.

## Seudónimos

En historiales públicos, cada postor aparece como `"Postor N"`, donde N es el orden de su primera puja en esa subasta. El propio usuario ve `"Tú"`. El dueño ve identidades reales solo después del cierre.

## Matriz de visibilidad

| Dato | Público / otros usuarios | Participante (sobre sí mismo) | Dueño de la subasta | Moderador / admin |
|---|---|---|---|---|
| `reserve_price` | Nunca; solo `has_reserve` y `reserve_met` | Nunca | Siempre | Siempre |
| `proxy_bid_limit.max_amount` | Nunca | Solo el suyo | Nunca | Nunca |
| Pujas ascendentes | Importe, `seq`, seudónimo, `source`, hora | Igual + marca "Tú" | Seudónimos hasta el cierre; identidades después | Todo |
| Ofertas selladas antes del cierre | Solo `active_offer_count` (`bid_count` y `current_price` se devuelven `null`) | Solo la suya | Solo `active_offer_count` | Solo `active_offer_count` |
| Ofertas selladas después del cierre | Precio final y número de ofertas | Ranking con importes y seudónimos, su posición | Todas con identidad | Todo |
| Inversa durante la puja | Mejor total vigente | Mejor total, si va ganando, sus ofertas | Totales con seudónimos | Todo |
| Inversa después del cierre | Total ganador y proveedor ganador | Ranking con seudónimos | Todo con identidad | Todo |
| Inscripciones inversa | Número de admitidos | La propia y su decisión | Todas | Todas |
| `candle_seed`, `candle_close_at` | Solo tras el cierre | Solo tras el cierre | Solo tras el cierre | Solo tras el cierre |
| Email de usuarios | Nunca | El propio | El del ganador tras `awarded` | Sí |
| Email del dueño | Nunca | El ganador tras `awarded` | El propio | Sí |

Pruebas obligatorias: por cada fila "Nunca" existe una prueba que serializa la respuesta y verifica que el valor secreto no aparece en el JSON (búsqueda del literal).
