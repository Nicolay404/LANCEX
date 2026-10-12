# Roles, capacidades y permisos

**Estado:** aprobado (2026-10-11). Decisión de arquitectura: [ADR-0006](../01-arquitectura/decisiones/ADR-0006-AUTORIZACION-Y-CARGA-POR-ROL.md). Pantallas por rol: [`PANTALLAS-Y-NAVEGACION.md`](../08-interfaz/PANTALLAS-Y-NAVEGACION.md). Controles de seguridad: [`SEGURIDAD-Y-AUTORIZACION.md`](../05-calidad/SEGURIDAD-Y-AUTORIZACION.md).

## 1. Principio

> **El servidor decide qué puede hacer cada usuario en cada petición.** El frontend solo refleja esa decisión para mostrar u ocultar pantallas. Ocultar un botón no es seguridad; la seguridad está en que el endpoint rechaza la acción aunque alguien la invoque desde la consola del navegador, Postman o `curl`.

La autorización se evalúa en tres niveles, siempre en el backend:

1. **Rol de plataforma** (quién eres en LANCEX): `visitor`, `user`, `moderator`, `admin`.
2. **Rol contextual de organización** (en nombre de quién actúas): `owner` o `member` de una organización compradora y/o proveedora, verificada.
3. **Condición sobre el objeto y su estado** (sobre qué y cuándo): ser dueño de la subasta, estar admitido, que la subasta esté activa, etc.

Una acción se permite solo si se cumplen los tres niveles que le aplican.

## 2. Tipos de usuario

| Rol | Cómo se obtiene | Para qué existe | Restricción clave |
|---|---|---|---|
| **Visitante** (`visitor`) | Sin sesión | Explorar subastas públicas y entender las reglas | Solo lectura de datos públicos |
| **Usuario** (`user`) | Registro con email y contraseña | Comprar y vender como persona: publicar, subastar (ascendente y sobre cerrado), pujar | No puede actuar sobre sus propias subastas ni sobre las de sus organizaciones |
| **Miembro de organización compradora** | Usuario + membresía activa en una organización `verified` con `is_buyer` | Publicar necesidades B2B y crear subastas inversas | Solo en nombre de esa organización |
| **Miembro de organización proveedora** | Usuario + membresía activa en una organización `verified` con `is_supplier` | Inscribirse y ofertar a la baja en subastas inversas | No puede participar en subastas de organizaciones de las que también es miembro |
| **Propietario de organización** (`owner`) | Quien crea la organización o recibe la transferencia | Gestionar datos y miembros de la organización | Siempre debe existir al menos un `owner` activo |
| **Moderador** (`moderator`) | Asignado por un admin | Verificar organizaciones, atender reportes, cancelar subastas y suspender usuarios, siempre con motivo | **Cuenta solo de staff**: no compra, no vende, no pertenece a organizaciones |
| **Administrador** (`admin`) | Semilla inicial o asignado por otro admin | Todo lo del moderador más gestión de usuarios y roles, categorías, auditoría y salud del sistema | **Cuenta solo de staff**; no puede quitarse el rol si es el último admin |

Notas:

- Un mismo usuario puede ser miembro de varias organizaciones. En la interfaz elige su **contexto activo** (personal u organización X); el backend no confía en ese contexto: cada petición B2B incluye el `organization_id` y se valida la membresía en ese momento.
- **Separación de funciones:** las cuentas `moderator` y `admin` existen solo para gobernar la plataforma. Así nadie puede moderar subastas en las que tiene interés económico. Un integrante del equipo que quiera probar como comprador usa otra cuenta.
- Usuario **suspendido** (`status = suspended`): no puede iniciar sesión; sus sesiones se eliminan al suspenderlo.

## 3. Catálogo de capacidades

Las capacidades son permisos con nombre que el backend calcula en cada petición a partir del rol, las membresías y el estado de la cuenta. Se devuelven en `GET /auth/me` solo para que el frontend construya su menú y sus rutas.

### Globales

| Capacidad | Visitante | Usuario | Moderador | Admin |
|---|---|---|---|---|
| `catalog.view` (catálogo, detalle público, perfiles públicos, prueba de vela) | ✅ | ✅ | ✅ | ✅ |
| `account.manage_own` (perfil, contraseña, cerrar sesión) | | ✅ | ✅ | ✅ |
| `notification.read_own` | | ✅ | ✅ | ✅ |
| `listing.manage_own` | | ✅ | | |
| `auction.create_personal` (ascendente y sobre cerrado) | | ✅ | | |
| `auction.manage_own` (publicar, cancelar, ver panel de dueño, liquidación) | | ✅ | | |
| `bid.place` (puja ascendente) | | ✅ | | |
| `proxy.manage_own` | | ✅ | | |
| `sealed.manage_own` | | ✅ | | |
| `watchlist.manage_own` | | ✅ | | |
| `rating.submit` | | ✅ | | |
| `report.create` | | ✅ | | |
| `organization.create` | | ✅ | | |
| `moderation.verify_organizations` | | | ✅ | ✅ |
| `moderation.review_reports` | | | ✅ | ✅ |
| `moderation.cancel_auction` | | | ✅ | ✅ |
| `moderation.suspend_user` | | | ✅ | ✅ |
| `moderation.view_auction_internals` (identidades y pujas con nombres; nunca máximos proxy ni sellados no revelados) | | | ✅ | ✅ |
| `admin.manage_users` (reactivar, cambiar rol de plataforma) | | | | ✅ |
| `admin.manage_categories` | | | | ✅ |
| `admin.view_audit` | | | | ✅ |
| `admin.view_system_health` | | | | ✅ |

### Contextuales de organización (se evalúan por `organization_id`)

| Capacidad | Condición |
|---|---|
| `org.view` | Membresía activa |
| `org.manage_members` | `owner` activo |
| `org.transfer_ownership` | `owner` activo |
| `org.edit_profile` | `owner` activo; si la organización estaba `rejected`, editar la devuelve a `pending` |
| `procurement.manage` | Membresía activa + organización `verified` + `is_buyer` |
| `auction.create_reverse` | Membresía activa + organización `verified` + `is_buyer` |
| `participants.decide` | Membresía activa en la organización dueña de la subasta inversa |
| `reverse.register` | Membresía activa + organización `verified` + `is_supplier` + sin conflicto de interés |
| `reverse.bid` | `reverse.register` + inscripción `admitted` en esa subasta |

## 4. Condiciones sobre objetos (nivel 3)

Estas reglas se aplican además de la capacidad. Si el objeto no es visible para el usuario, la respuesta es **404** (no se revela que existe); si es visible pero la acción no está permitida, **403** o el código de dominio correspondiente.

| Acción | Condición sobre el objeto |
|---|---|
| Ver subasta en `draft` | Solo su dueño (u organización dueña). Para el resto, 404 |
| Ver subasta `scheduled/active/closed/cancelled` | Pública |
| Editar publicación | Dueño y sin subasta no terminal asociada |
| Editar/publicar/cancelar subasta | Dueño (u `owner`/`member` de la organización dueña) y estado permitido (`REGLAS` §9) |
| Pujar / ofertar sellado / fijar proxy | No ser dueño ni miembro de la organización dueña; estado efectivo `active`; cuenta `active` |
| Ofertar en inversa | Organización del usuario `admitted` en esa subasta; no ser miembro de la organización compradora |
| Ver panel de dueño (pujas con identidad tras el cierre) | Dueño |
| Ver contacto post-cierre | Dueño o ganador, con `outcome = awarded` |
| Marcar liquidación | Dueño, con `outcome = awarded` |
| Calificar | Dueño o ganador, `settlement_status` final, una vez por subasta |
| Leer notificación | Destinatario |
| Ver inscripciones de una subasta inversa | Organización compradora: todas; proveedor: solo la suya |
| Gestionar miembros | `owner` de esa organización |
| Cancelar como moderador | Estado distinto de `closed`; `reason` obligatorio |
| Suspender usuario | Moderador/admin; no puede suspender a otro staff (solo admin suspende moderadores); nunca a sí mismo |
| Cambiar rol de plataforma | Admin; no puede degradarse si es el último admin; un usuario con membresías u operaciones abiertas no puede pasar a staff hasta cerrarlas |

## 5. Conflictos de interés (reglas explícitas)

1. Nadie puja, oferta ni fija proxy en una subasta propia o de una organización de la que es miembro activo (`BID_ON_OWN_AUCTION`).
2. Un usuario miembro de la organización compradora no puede inscribir a una organización proveedora en esa subasta (`CONFLICT_OF_INTEREST`).
3. Una organización no puede ser compradora y proveedora en la misma subasta.
4. Staff (moderador/admin) no participa comercialmente.
5. El sistema **no puede impedir** que una persona cree una segunda cuenta con otro email para inflar precios (*shill bidding*). Mitigaciones: reportes, revisión por moderadores, reputación y límites de actividad. Se declara como riesgo aceptado (ver `SEGURIDAD-Y-AUTORIZACION.md`).

## 6. Ciclo de vida de los roles

```text
(registro) ──▶ user/active ──(moderador o admin suspende, con motivo)──▶ user/suspended
                   │                                                        │
                   │                                         (admin reactiva, con motivo)
                   ▼                                                        ▼
       (admin asigna moderator/admin, solo si no tiene              user/active
        membresías ni subastas/pujas abiertas)
                   ▼
       moderator|admin/active ──(admin revierte a user)──▶ user/active
```

- Todo cambio de rol o estado de cuenta: requiere `reason`, se audita (`user_role_changed`, `user_suspended`, `user_reactivated`) y **elimina todas las sesiones** del usuario afectado, que debe volver a iniciar sesión con sus nuevas capacidades.
- El primer admin se crea con `seed_demo` (o un comando `bootstrap_admin` que solo funciona si no existe ningún admin). No existe `createsuperuser` (ADR-0003).

## 7. Efecto de la suspensión sobre operaciones en curso

| Situación | Efecto |
|---|---|
| Subastas propias `draft`/`scheduled` | Se cancelan automáticamente con motivo `owner_suspended` |
| Subastas propias `active` | Siguen; un moderador decide si cancelarlas (las pujas recibidas son de terceros de buena fe) |
| Pujas del suspendido en subastas ajenas | Se mantienen (son irrevocables); si es líder y la subasta cierra, gana. Un moderador puede cancelar la subasta si hay fraude |
| Límites proxy activos | Pasan a `cancelled` y dejan de generar pujas automáticas |
| Ofertas selladas vigentes | Pasan a `withdrawn` |
| Membresías de organización | Se mantienen pero no puede actuar (no tiene sesión) |
