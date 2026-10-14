# Seguridad, autorización y anti-manipulación

**Estado:** aprobado (2026-10-11). Complementa `PRUEBAS-Y-SEGURIDAD.md` con el modelo de amenazas y los controles concretos. Decisión base: ADR-0006.

## 1. Supuesto de partida

El atacante es un usuario registrado (o visitante) que **controla por completo su navegador**: lee todo el JavaScript, edita el estado de React, modifica peticiones con DevTools o un proxy, llama a cualquier endpoint con `fetch` desde la consola, repite peticiones, cambia IDs y adelanta el reloj de su computadora. Todo control de LANCEX debe resistir esto. **Ningún control de seguridad depende del frontend.**

## 2. Modelo de amenazas y controles

| # | Ataque | Ejemplo | Control | Prueba |
|---|---|---|---|---|
| T01 | Activar funciones de otro rol desde la consola | Cambiar `capabilities` en el estado de React y abrir `/admin` | Rutas construidas desde `/auth/me`; aunque se fuerce la pantalla, cada endpoint exige su capacidad → 403 | Inventario de endpoints (§5) |
| T02 | Llamar endpoints de staff a mano | `fetch('/api/v1/admin/users/...', {method:'PATCH'})` | `DenyAll` por defecto + `HasCapability` por vista + system check | Usuario normal recibe 403 en todos los endpoints `moderation/*` y `admin/*` |
| T03 | Escalar privilegios con campos extra | `PATCH /auth/me {"platform_role":"admin"}` | `StrictInputMixin` → `400 UNKNOWN_FIELD` + evento de seguridad | Prueba por endpoint mutable con campos prohibidos |
| T04 | Asignar valores calculados por el servidor | `POST /bids {"amount":"1.00","status":"accepted","winner_user_id":...}` | Serializadores de entrada con lista blanca; el servidor calcula todo | Igual que T03 |
| T05 | IDOR: acceder a objetos ajenos cambiando el ID | Leer `/auctions/{id-borrador-ajeno}/`, `/organizations/{otra}/` | `visible_to(user)` en el queryset → 404; condición de objeto en el servicio | Matriz usuario × objeto ajeno → 404/403 |
| T06 | Fuga de datos privados por la API | Leer máximos proxy, reserva u ofertas selladas | Serializadores por audiencia con lista blanca; tablas separadas | QA-02: búsqueda del literal secreto en cada respuesta |
| T07 | Fuga por canales laterales | Deducir ofertas selladas por `bid_count`, deducir el instante de vela por rechazos | `bid_count`/`current_price` en `null` para sellado; en vela se aceptan pujas hasta `ends_at`; respuestas con la misma forma | Pruebas de forma de respuesta |
| T08 | Pujar fuera de reglas desde la consola | Puja menor al mínimo, sobre subasta propia, tras el cierre | Validación en dominio dentro de la transacción | Casos de `REGLAS` por modalidad |
| T09 | Manipular el tiempo | Adelantar el reloj del PC para pujar tarde | Hora de PostgreSQL; el cliente nunca envía horas | QA-03 |
| T10 | Repetición y carrera | Doble clic, script que envía 100 pujas a la vez | `Idempotency-Key`, `FOR UPDATE`, throttling, 1 puja/s por usuario y subasta | QA-01, QA-08 |
| T11 | Fuerza bruta de login | Diccionario de contraseñas | Throttling por IP y por cuenta (5 intentos / 15 min) con caché en base compartida (`django_cache`) para que valga en los 3 backends; mensaje genérico | Prueba de bloqueo |
| T12 | Robo o fijación de sesión | Leer la cookie con JS, reutilizar sesión vieja | `HttpOnly`, `SameSite=Lax`, rotación de clave al iniciar sesión, expiración absoluta de 12 h, logout borra la sesión, suspensión/cambio de rol/cambio de contraseña borran sesiones | Pruebas de sesión |
| T13 | CSRF | Sitio externo que envía una puja | Token CSRF obligatorio en métodos mutables, `CSRF_TRUSTED_ORIGINS` restringido | Petición sin token → 403 |
| T14 | XSS almacenado | Descripción con `<script>` o `<img onerror>` | Texto plano: React escapa; prohibido `dangerouslySetInnerHTML`; sin Markdown/HTML; SVG prohibido en imágenes; CSP en build de producción | Prueba de render con payloads |
| T15 | Clickjacking | Incrustar LANCEX en un iframe para engañar clics | `X-Frame-Options: DENY` / `frame-ancestors 'none'` | Cabecera presente |
| T16 | Enumeración | Descubrir usuarios o subastas en borrador | UUID, sin endpoint de listado de usuarios, seudónimos, 404 para no visibles, login genérico | Pruebas de 404 |
| T17 | Subida maliciosa | Archivo ejecutable o enorme como "imagen" | URL firmada para una ruta generada por el servidor, tipo y tamaño validados antes y después (consulta de metadatos en Storage), bucket privado, sin SVG | Pruebas de upload |
| T18 | Acceso directo a la base desde el navegador | Usar la API de datos de Supabase | Esquema `lancex` no expuesto, RLS sin políticas, ninguna clave de Supabase en el frontend | Revisión de configuración |
| T19 | Escritura directa en Firestore | Inyectar logs falsos | Reglas `allow read, write: if false`; solo Admin SDK del backend | Revisión de reglas |
| T20 | Abuso de staff | Moderador cancela subastas sin motivo o se da permisos | Motivo obligatorio, auditoría append-only, staff sin actividad comercial, solo admin gestiona roles, último admin protegido | Pruebas de permisos de staff |
| T21 | Información interna en errores | Stack traces o SQL en la respuesta | Manejador de excepciones propio: siempre `{code, message, request_id}`; `DEBUG=False` en la demo | Error forzado sin detalles |
| T22 | Datos sensibles en logs | Contraseñas o máximos en Firestore | `SensitiveDataFilter` + lista de prohibidos (ADR-0002) | Prueba de no fuga en logs |
| T23 | Denegación de servicio ligera | Polling agresivo o creación masiva | Throttling por usuario/IP, `304` en `live/`, límites de publicaciones/subastas/reportes | Prueba de throttling |
| T24 | Shill bidding con cuentas falsas | Segunda cuenta que infla el precio | **Mitigación parcial:** reportes, moderación, reputación, límites; sin verificación de identidad real | Riesgo aceptado (§7) |

## 3. Controles del backend (obligatorios)

1. **Deny by default:** `DenyAll` como permiso global; cada vista declara `public = True` o `required_capability`.
2. **System check** `lancex.E001`: falla el arranque si una vista del URLConf no declara permiso.
3. **Capacidades por petición** calculadas desde la base (`apps/core/capabilities.py`), nunca desde datos del cliente ni de la sesión.
4. **Servicios revalidan** objeto y estado aunque la vista ya lo haya hecho.
5. **Querysets limitados** con `visible_to(user)`; prohibido `Model.objects.all()` en vistas.
6. **Serializadores:** salida con lista blanca por audiencia; entrada estricta que rechaza campos desconocidos.
7. **Errores uniformes** sin detalles internos; 404 para no visible, 403 para no permitido.
8. **Throttling** (ADR-0004, Enmienda 1): bloqueo de login y límites de `login`, `register` y `reports` en `DatabaseCache` (`lancex.django_cache`), compartidos por los 3 backends; `anon`, `user` y `bids` en memoria de cada proceso (`apps.core.throttling`) para no consultar la base en cada petición.
9. **Sesión:** `SESSION_COOKIE_AGE = 43200` (12 h), `HttpOnly`, `SameSite=Lax`, rotación al iniciar sesión; funciones `revoke_all_sessions(user)` usadas en suspensión, cambio de rol y cambio de contraseña.
10. **Acciones sensibles con confirmación de contraseña** (*step-up*): cambiar contraseña, transferir propiedad de organización, cambiar rol de plataforma.
11. **Cabeceras:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin`. CSP en el build de producción: `default-src 'self'; img-src 'self' https://<proyecto>.supabase.co; frame-ancestors 'none'; object-src 'none'`.
12. **Eventos de seguridad a Firestore** (`WARNING`): `authz_denied`, `unknown_field_rejected`, `login_failed`, `login_locked`, `rate_limited`, `suspended_login_attempt`, `csrf_failed`. Incluyen `user_id`, ruta con plantilla y `request_id`; nunca contraseñas ni cuerpos.

## 4. Controles del frontend (experiencia, no seguridad)

1. Rutas y menú desde `capabilities` de `/auth/me`; ruta sin capacidad = no registrada = 404.
2. Paquetes de código por grupo de rol con `import()` dinámico; un usuario normal no descarga `moderation` ni `admin`.
3. Nada de rol o capacidades en `localStorage`/`sessionStorage`.
4. Ningún secreto en variables `VITE_*`. Solo `VITE_API_BASE`.
5. Sin modos ocultos, banderas de depuración ni objetos colgados en `window`.
6. Build de producción sin source maps y sin `console`/`debugger`.
7. Logout: limpiar caché de TanStack Query y recargar la página.
8. Validación con Zod solo para dar retroalimentación rápida; el servidor vuelve a validar todo.

Mensaje para el equipo: si una funcionalidad "se puede activar desde la consola", el error está en el backend, no en el frontend.

## 5. Prueba de inventario de endpoints (obligatoria en CI)

Una prueba recorre **todas** las rutas del URLConf y, para cada combinación de método y actor (`visitor`, `user`, miembro comprador, miembro proveedor, `moderator`, `admin`), compara el código de respuesta con una tabla esperada (`tests/security/endpoint_matrix.yaml`). Una ruta nueva sin fila en la tabla hace fallar la prueba. Así el equipo no puede olvidar proteger un endpoint.

## 6. Lista de verificación por PR (seguridad)

- [ ] La vista declara su capacidad o `public = True`.
- [ ] El queryset está limitado por usuario.
- [ ] Serializador de salida con lista blanca revisado contra la matriz de visibilidad.
- [ ] Serializador de entrada estricto; campos calculados no aceptados.
- [ ] El servicio revalida objeto y estado.
- [ ] Fila nueva en `endpoint_matrix.yaml`.
- [ ] Ningún dato privado en logs ni auditoría.
- [ ] La pantalla solo existe si el usuario tiene la capacidad.

## 7. Riesgos aceptados (declarados)

| Riesgo | Por qué se acepta | Mitigación |
|---|---|---|
| Cuentas múltiples de una misma persona | No hay verificación de identidad ni de email (sin servicio de correo) | Reportes, moderación, reputación, límites |
| El código del frontend es legible | Es inherente a la web | Nada sensible en el frontend; backend como autoridad |
| El registro revela si un email ya existe (`EMAIL_ALREADY_REGISTERED`) | Sin verificación por correo no hay alternativa usable | Throttling de registro 3/min por IP |
| Personas con acceso a Supabase pueden leer datos privados | Los 3 integrantes administran la base | Uso del Table Editor solo lectura, auditoría, nada de datos reales |
| Dependencia única de Supabase | Decisión de infraestructura (ADR-0004) | Mensaje de servicio no disponible |
| Secreto TOTP en claro en `user_mfa` | El servidor lo necesita para verificar; cifrarlo exigiría una clave compartida entre las 3 laptops | Solo `lancex_app` + RLS; nunca en logs, auditoría ni respuestas tras la activación |
| Recuperación de contraseña sin correo | Sin proveedor de email (decisión del equipo) | Enlace de un solo uso (30 min, solo hash) emitido por un admin con step-up y motivo, auditado |
