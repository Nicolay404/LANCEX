# Pantallas y navegación por rol

**Estado:** aprobado (2026-10-11). Cada pantalla indica la capacidad que la habilita (`ROLES-Y-PERMISOS.md`), el paquete de código donde vive (ADR-0006) y los endpoints que usa (`CONTRATO-API-INICIAL.md`). **Si el usuario no tiene la capacidad, la ruta no se registra y se muestra 404.**

## 1. Estructura general

- **Barra superior:** logo, buscador, menú construido desde `capabilities`, campana de notificaciones (si `notification.read_own`), selector de **contexto activo** (Personal / Organización X) si el usuario tiene membresías, menú de cuenta.
- **Pie:** reglas de cada modalidad, términos de uso y lista de artículos prohibidos.
- **Estados comunes en todas las pantallas:** cargando (skeleton), vacío, error con `request_id` visible para soporte, sin permiso, sin conexión (polling detenido con aviso).
- **Hora:** cuentas regresivas con `server_time` de la API; fechas mostradas en `America/Guayaquil`.
- **Dinero:** USD con 2 decimales; montos sin IVA con la leyenda correspondiente.

## 2. Visitante (paquete `public`)

| Ruta | Pantalla | Funcionalidades | Endpoints |
|---|---|---|---|
| `/` | Inicio / catálogo | Buscar, filtrar por categoría, modalidad y estado; ordenar; "terminan pronto" | `GET /auctions/`, `GET /categories/` |
| `/subastas/:id` | Detalle público | Fotos, descripción, reglas congeladas, precio actual, mínimo siguiente, cuenta regresiva, historial seudonimizado, `reserve_met`, aviso de fase de vela, compromiso de vela. Botón "Pujar" lleva al login | `GET /auctions/{id}/`, `GET /auctions/{id}/live/`, `GET /auctions/{id}/bids/` |
| `/subastas/:id/resultado` | Resultado público | Precio final, número de pujas/ofertas, ganador seudonimizado | `GET /auctions/{id}/result/` |
| `/subastas/:id/verificar-vela` | Verificación de vela | Muestra compromiso, semilla revelada e instante; recalcula en el navegador con Web Crypto y compara | `GET /auctions/{id}/candle-proof/` |
| `/usuarios/:id` | Perfil público | Nombre visible, reputación, subastas públicas del vendedor | `GET /users/{id}/` |
| `/necesidades/:id` | Necesidad B2B pública | Especificaciones, cantidad, fechas, número de proveedores admitidos | `GET /procurement-requests/{id}/` |
| `/ingresar`, `/registro` | Login y registro | Formularios con validación Zod; mensajes genéricos en login | `/auth/csrf/`, `/auth/login/`, `/auth/register/` |
| `/ayuda/*` | Cómo funciona | Explicación de cada modalidad, proxy, soft close, vela; términos y artículos prohibidos | estático |

## 3. Usuario (paquete `user`)

Incluye todo lo público, más:

| Ruta | Pantalla | Capacidad | Funcionalidades |
|---|---|---|---|
| `/panel` | Mi actividad | `bid.place` | Resumen: subastas donde voy ganando / me superaron, mis subastas activas, notificaciones recientes |
| `/subastas/:id` (vista de postor) | Detalle con acciones | `bid.place` | Pujar (confirmación si la puja supera 3 veces el precio actual), fijar/subir máximo proxy con explicación, oferta sellada (crear, reemplazar, retirar), seguir subasta, reportar. Muestra "Vas ganando / Te superaron" sin revelar máximos ajenos. **En sobre cerrado no existe ese indicador** (revelaría información): solo se muestra la oferta propia vigente y el número de participantes |
| `/mis-pujas` | Mis participaciones | `bid.place` | Pestañas: activas, ganadas, perdidas; mi máximo proxy por subasta; mi oferta sellada vigente (sin posición hasta el cierre) |
| `/seguimiento` | Watchlist | `watchlist.manage_own` | Subastas seguidas con cuenta regresiva |
| `/notificaciones` | Notificaciones | `notification.read_own` | Lista, marcar leídas |
| `/mis-publicaciones` | Mis artículos | `listing.manage_own` | Listar, crear, editar (si no tienen subasta no terminal), subir imágenes |
| `/mis-publicaciones/nueva`, `/:id/editar` | Formulario de publicación | `listing.manage_own` | Título, descripción en texto plano, categoría, estado del artículo, ciudad, hasta 6 imágenes (JPEG/PNG/WebP ≤ 5 MB) |
| `/mis-subastas` | Mis subastas como vendedor | `auction.manage_own` | Por estado: borrador, programadas, activas, cerradas, canceladas; acciones según estado |
| `/mis-subastas/nueva` | Asistente de creación | `auction.create_personal` | Paso 1 publicación → 2 modalidad (ascendente o sobre cerrado) → 3 parámetros (con validación de matriz) → 4 cierre (fijo, soft close, vela) → 5 revisión → guardar borrador o publicar. Aviso: "al publicar, las reglas no se pueden cambiar" |
| `/mis-subastas/:id` | Panel de dueño | `auction.manage_own` + dueño | Estado en vivo, historial seudonimizado, número de seguidores y ofertas (sellado: solo cantidad), cancelar si está permitido, tras cierre: identidades, contacto del ganador, liquidación, calificar |
| `/subastas/:id/contacto` | Contacto post-cierre | dueño o ganador | Nombre y email de la contraparte, estado de liquidación |
| `/calificar/:auctionId` | Calificar | `rating.submit` | 1 a 5 y comentario |
| `/reportar` (modal) | Reportar | `report.create` | Motivo (fraude, artículo prohibido, información engañosa, otro) y detalle |
| `/organizaciones` | Mis organizaciones | `organization.create` | Lista, estado de verificación, crear organización (RUC, razón social, compradora/proveedora) |
| `/cuenta` | Mi cuenta | `account.manage_own` | Nombre visible, cambiar contraseña (pide la actual), cerrar sesión |

## 4. Contexto de organización compradora (paquete `org-buyer`)

Disponible cuando el contexto activo es una organización con `auction.create_reverse`.

| Ruta | Pantalla | Funcionalidades |
|---|---|---|
| `/org/:orgId` | Panel de la organización | Subastas inversas por estado, inscripciones pendientes de calificar |
| `/org/:orgId/necesidades` | Necesidades | Crear y listar `procurement_request` (especificaciones, cantidad, unidad, requisitos obligatorios, fecha y lugar de entrega) |
| `/org/:orgId/subastas/nueva` | Crear subasta inversa | Presupuesto referencial, decremento mínimo, fechas de inscripción y de puja, cierre fijo o soft close |
| `/org/:orgId/subastas/:id/calificacion` | Calificar proveedores | Ver declaraciones de cumplimiento por requisito; admitir o rechazar con motivo. Bloqueado desde `starts_at` |
| `/org/:orgId/subastas/:id` | Sala del comprador | Mejor total vigente, totales con proveedores seudonimizados, cuenta regresiva; tras el cierre: identidades, contacto del ganador, liquidación, calificar |

## 5. Contexto de organización proveedora (paquete `org-supplier`)

| Ruta | Pantalla | Funcionalidades |
|---|---|---|
| `/org/:orgId/oportunidades` | Oportunidades | Subastas inversas en inscripción o activas, filtradas por el servidor (excluye las de organizaciones donde el usuario tiene conflicto) |
| `/org/:orgId/oportunidades/:id/inscripcion` | Inscripción | Declarar cumplimiento por requisito y comentario |
| `/org/:orgId/inscripciones` | Mis inscripciones | Estado (registrada, admitida, rechazada con motivo) |
| `/org/:orgId/sala/:id` | Sala de puja inversa | Ingresar precio unitario y envío; el sistema muestra el total calculado antes de enviar; mejor total vigente; "Vas ganando / Te superaron" |

## 6. Propietario de organización (dentro de `org-buyer`/`org-supplier`)

| Ruta | Pantalla | Funcionalidades |
|---|---|---|
| `/org/:orgId/miembros` | Miembros | Agregar por email, revocar, transferir propiedad (requiere confirmar contraseña) |
| `/org/:orgId/perfil` | Datos de la organización | Editar razón social y tipo; si fue rechazada, reenviar a verificación |

## 7. Moderador (paquete `moderation`)

El moderador **no** ve el menú comercial (no puja, no vende, no tiene organizaciones).

| Ruta | Pantalla | Funcionalidades |
|---|---|---|
| `/moderacion` | Bandeja | Contadores: organizaciones pendientes, reportes abiertos, subastas activas reportadas |
| `/moderacion/organizaciones` | Verificación | Ver datos de la organización y sus miembros; verificar o rechazar con nota |
| `/moderacion/reportes` | Reportes | Ver reporte, objeto reportado, historial; resolver: descartar, cancelar subasta, suspender usuario (cada acción con motivo) |
| `/moderacion/subastas/:id` | Vista de moderación | Pujas con identidades reales, auditoría de esa subasta; **nunca** máximos proxy ni ofertas selladas antes de la revelación; cancelar con motivo |
| `/moderacion/usuarios/:id` | Ficha de usuario | Actividad, reportes recibidos, suspender con motivo |

## 8. Administrador (paquetes `moderation` + `admin`)

| Ruta | Pantalla | Funcionalidades |
|---|---|---|
| `/admin/usuarios` | Usuarios | Buscar, ver estado y rol, reactivar, cambiar rol de plataforma (con motivo; validaciones de `ROLES-Y-PERMISOS.md` §4) |
| `/admin/categorias` | Categorías | Crear, renombrar, desactivar (no se borran si tienen publicaciones) |
| `/admin/auditoria` | Auditoría | Filtrar `audit_event` por subasta, usuario, acción y fecha; ver `request_id` para cruzar con Firestore |
| `/admin/sistema` | Salud | Última ejecución de `close_due_auctions` por backend (`dev`), subastas con cierre pendiente, conteos generales |

## 9. Reglas de interfaz que son también reglas de seguridad

1. Ninguna pantalla recibe datos que el usuario no pueda ver: si el backend no los envía, no hay nada que ocultar con CSS ni que leer desde DevTools.
2. Ningún formulario envía campos calculados por el servidor (`status`, `current_price`, `winner`, `total`, `accepted_at`).
3. Las descripciones se muestran como **texto plano** (sin HTML ni Markdown). Nunca `dangerouslySetInnerHTML`.
4. Enlaces externos con `rel="noopener noreferrer"`. No se aceptan URLs ingresadas por usuarios salvo las firmadas de imágenes que entrega el backend.
5. Botones de acciones irreversibles (publicar, pujar, cancelar, suspender) piden confirmación y se deshabilitan mientras la petición está en curso; la protección real ante dobles envíos es la `Idempotency-Key`.
