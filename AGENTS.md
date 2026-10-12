# Instrucciones globales para agentes de IA: LANCEX

## Antes de actuar

1. Lee este archivo y `documentacion/06-ia/PROTOCOLO-DE-IA.md`.
2. Lee `documentacion/00-contexto/PLAN-DE-DESARROLLO.md`: fases, orden de construcción y tareas por rol.
3. Lee `documentacion/06-ia/ESTADO-COMPARTIDO.md` y el handoff de tu rol.
4. Lee las reglas del dominio, el modelo de datos y el contrato de API que afecten a tu tarea.
5. Inspecciona el código real y las pruebas antes de proponer cambios.
6. Registra el inicio del trabajo en la bitácora de tu rol con fecha/hora generada por el entorno.
7. Antes de modificar código, presenta un plan pequeño y los riesgos.

## Arquitectura acordada (resumen de las ADR)

- Frontend: React + TypeScript + Vite, ejecutado en local (ADR-0004).
- Backend: Python + Django + Django REST Framework, ejecutado en local por cada integrante (ADR-0001, ADR-0004).
- Base de datos: **un único** PostgreSQL en Supabase compartido por los tres integrantes, esquema `lancex` (ADR-0003, ADR-0004).
- Logs técnicos: Firestore (Firebase), enviados de forma asíncrona. Auditoría de negocio: tabla `audit_event` en PostgreSQL (ADR-0002).
- Autenticación: sesión de Django con cookie + CSRF; el frontend llama a `/api` a través del proxy de Vite (ADR-0004).
- Motor de subastas: Strategy por mecanismo, máquina de estados y cierre perezoso (ADR-0005).
- Autorización por capacidades calculadas en el servidor y carga de la interfaz por rol (ADR-0006).
- No se usan: Redis, Celery, Channels/WebSockets, Firebase Analytics, Supabase Auth ni Django Admin (ver ADR-0004).

## Reglas de base de datos (OBLIGATORIAS)

**LANCEX NO usa migraciones de Django.** El esquema se define en SQL dentro de `supabase/migrations/` y se aplica con la Supabase CLI. Ver ADR-0003 y `documentacion/07-operacion/GESTION-DEL-ESQUEMA.md`.

Un agente de IA:

- **NUNCA** ejecuta ni sugiere ejecutar `makemigrations`, `migrate`, `flush`, `sqlflush`, `createsuperuser` ni `loaddata` contra la base compartida.
- **NUNCA** crea carpetas `migrations/` en las apps de Django ni archivos de migración de Django.
- **NUNCA** ejecuta `supabase db push`, `supabase db reset` ni SQL DDL contra el proyecto compartido. Solo el responsable humano de base de datos aplica migraciones tras el merge a `main`.
- **NUNCA** edita un archivo de `supabase/migrations/` que ya fue aplicado; crea uno nuevo.
- Todo modelo Django nuevo o modificado usa `managed = False` y `db_table` explícito, y debe coincidir con el SQL.
- Si una tarea necesita una columna o tabla nueva: crea el archivo SQL nuevo, actualiza el modelo con `managed = False`, actualiza `documentacion/03-dominio/MODELO-DE-DATOS-INICIAL.md` y deja un handoff al rol de base de datos.
- La hora de negocio (inicio, cierre, aceptación de puja) se obtiene de PostgreSQL, no de `timezone.now()` de la laptop.
- Django se conecta como `lancex_app` (sin permisos DDL). No pedir ni usar la contraseña de `postgres` en el backend.

## Reglas de seguridad y autorización (OBLIGATORIAS)

Ver ADR-0006, `documentacion/03-dominio/ROLES-Y-PERMISOS.md` y `documentacion/05-calidad/SEGURIDAD-Y-AUTORIZACION.md`.

- Toda vista nueva declara `required_capability` o `public = True`; el permiso global es `DenyAll`. Nunca desactivar el system check que lo verifica.
- Toda ruta nueva se agrega a `tests/security/endpoint_matrix.yaml` con el resultado esperado para cada rol.
- Nunca `fields = "__all__"`; serializadores de salida por audiencia con lista blanca y de entrada estrictos (rechazan campos desconocidos).
- Querysets siempre limitados con `visible_to(user)`; objeto no visible = 404.
- Los servicios revalidan permisos de objeto y estado; no confiar en que la vista ya lo hizo.
- En el frontend, rutas y menús solo desde `capabilities` de `/auth/me`; nada de rol en `localStorage`, ni banderas de depuración, ni funciones en `window`, ni secretos en `VITE_*`.
- Una funcionalidad que "se activa desde la consola" es un bug del backend: se corrige en el backend, no ocultando cosas en el frontend.
- Staff (`moderator`, `admin`) no tiene capacidades comerciales; no agregar excepciones.

## Reglas de implementación

- No reescribir módulos completos para resolver un cambio pequeño.
- No modificar archivos fuera del alcance sin explicarlo y solicitar autorización.
- No añadir dependencias fuera de la lista de ADR-0004 sin justificar necesidad, mantenimiento y compatibilidad.
- No eliminar o debilitar pruebas para lograr un resultado verde.
- No confiar en el frontend para validar importe, estado, permisos, máximo privado ni hora de cierre.
- No exponer máximos de proxy bidding, ofertas selladas, precio de reserva, semilla de vela, secretos ni credenciales (ver la matriz de visibilidad en `CONTRATO-API-INICIAL.md`).
- No escribir en los logs de Firestore contraseñas, tokens, cookies, máximos proxy, montos de ofertas selladas ni cuerpos completos de peticiones.
- Utilizar `Decimal` para dinero y `timestamptz` para instantes.
- No guardar secretos ni datos personales reales en prompts, documentación, issues o bitácoras.
- No adelantar funcionalidades de una fase posterior sin que su fase previa esté integrada en `main` (ver `PLAN-DE-DESARROLLO.md`).

## Evidencia obligatoria

Al finalizar una tarea, registra:

- Issue/PR y rama.
- Archivos modificados.
- Decisiones y supuestos.
- Comandos de prueba ejecutados y resultado real.
- Riesgos, errores no resueltos y siguiente paso.
- Handoff necesario para otros roles (obligatorio si tocaste SQL o el contrato de API).

Distingue entre **ejecutado**, **propuesto** y **pendiente**. La IA ayuda, pero no sustituye la revisión humana.
