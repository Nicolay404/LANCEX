# Estrategia de pruebas y seguridad

## Dónde corren las pruebas

- **Nunca contra el proyecto Supabase compartido.** Se usa un PostgreSQL local efímero (Docker) preparado con los mismos SQL de `supabase/migrations/` (ver `07-operacion/GESTION-DEL-ESQUEMA.md`).
- En CI, GitHub Actions levanta un servicio PostgreSQL de la misma versión mayor, aplica los SQL y ejecuta las pruebas.
- `FIRESTORE_LOGS_ENABLED=false` en pruebas; el handler de Firestore se prueba con un doble simulado.
- Como los modelos son `managed = False`, `conftest.py` sobrescribe `django_db_setup` para usar la base ya preparada.

## Pirámide de pruebas

1. **Unitarias de dominio** (sin base de datos, milisegundos): incrementos, decrementos, fórmula B2B, proxy, soft close, cálculo de vela, transiciones de estado, selección de ganador y empates.
2. **Integración backend/PostgreSQL:** servicios, permisos, idempotencia, cierres, grants del rol `lancex_app`, trigger append-only.
3. **Contrato:** respuestas de la API contra el esquema OpenAPI; prueba de deriva modelo ↔ SQL.
4. **Concurrencia:** pujas paralelas, cierre paralelo, reintentos (QA-01, QA-08).
5. **Seguridad:** inventario de endpoints por rol (QA-09), permisos por objeto, fugas de datos privados (QA-02), campos desconocidos, manipulación de parámetros, sesiones y rate limiting.
6. **Frontend:** componentes, formularios, estados de carga/error/vacío/cierre, accesibilidad básica.
7. **E2E (Playwright):** un recorrido completo por modalidad.

## Casos críticos por modalidad

- **Ascendente:** mínimo exacto aceptado y un centavo menos rechazado; autopuja; líder que intenta superarse; puja 1 s tarde; reserva no alcanzada → `unsold`; sin pujas → `unsold`.
- **Proxy:** límite nunca excedido; límites iguales → gana el primero; manual contra proxy superior; proxy contra proxy; bajar límite rechazado; invariante de un solo límite vivo.
- **Soft close:** puja dentro de la ventana extiende; tope total respetado.
- **Sobre cerrado:** nadie lee ofertas ajenas antes del cierre (ni el dueño); edición pierde prioridad; retiro; revelación idempotente.
- **Inversa:** total calculado con redondeo correcto; proveedor no admitido rechazado; admisión congelada en `starts_at`; total sobre el presupuesto rechazado.
- **Vela:** instante reproducible desde la semilla; pujas posteriores con `counted = false`; compromiso coincide con la semilla revelada.
- **Cierre:** tres ejecuciones simultáneas de `close_due_auctions` → un solo `auction_closed`.

## Prohibiciones verificadas por CI

- Existencia de carpetas `migrations/` en `backend/apps/` → falla.
- Uso de `timezone.now()` o `datetime.now()` dentro de `auctions/domain/` o `*/services/` → falla (la hora viene de `TimeSource`).
- Imports de `django` dentro de `auctions/domain/` → falla.

## Stack de calidad

- Backend: pytest, pytest-django, factory-boy, ruff.
- Frontend: ESLint, `tsc --noEmit`, Vitest, React Testing Library, Playwright.
- CI: GitHub Actions en cada PR a `main`.

## Seguridad mínima

- Sesión `HttpOnly`, `SameSite=Lax`, CSRF obligatorio en peticiones mutables; sin tokens en `localStorage`.
- Permisos comprobados en cada endpoint y sobre cada objeto (dueño, membresía, admisión).
- Nunca confiar en campos del cliente: `winner`, `accepted_at`, `status`, `current_price`, totales B2B y horas los calcula el servidor.
- Throttling de DRF (valores en ADR-0004).
- Secretos solo en `backend/.env` (fuera de Git): contraseña de `lancex_app`, credencial de Firebase, service role de Supabase. Ninguno en el frontend.
- Supabase: esquema `lancex` no expuesto en la Data API, RLS activado sin políticas, grants mínimos, `lancex_app` sin DDL.
- Firestore: reglas que niegan todo acceso de cliente.
- Imágenes: tipo y tamaño validados antes de emitir la URL firmada; bucket privado.
- Logs: `SensitiveDataFilter` y prueba de no fuga.
- Enumeración de usuarios: el login devuelve siempre un mensaje genérico; el registro sí revela si el email existe (riesgo aceptado, con throttling).
- Modelo de amenazas completo, controles anti-manipulación y prueba de inventario de endpoints: `SEGURIDAD-Y-AUTORIZACION.md`.

## Definition of Done

- Criterios de aceptación satisfechos.
- Pruebas apropiadas añadidas y ejecutadas; evidencia real en el PR.
- Lint, tipos y build pasan.
- Revisión de otra persona (cambios de SQL: una de backend y una de base de datos).
- Sin secretos ni fugas de datos privados.
- Documentación, contrato y bitácora de IA actualizados.
- Riesgos restantes declarados en el PR.
