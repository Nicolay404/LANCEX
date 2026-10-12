# Handoff: Base de datos

## Pendiente inicial

- LX-01: crear el proyecto Supabase, invitar a los 3, `supabase init` y `supabase link`.
- LX-02: migración base con TODO `MODELO-DE-DATOS-INICIAL.md`: esquema `lancex`, rol `lancex_app` (sin DDL, `search_path`), tablas, `CHECK`, índices, grants, RLS sin políticas, trigger append-only de `audit_event`, tablas `django_session` (con `user_id`), `django_cache`, `report` y `job_heartbeat`, columnas `platform_role` y `status` en `app_user`, índice único parcial de subasta abierta por publicación.
- Compartir la contraseña de `lancex_app` por el canal privado acordado.
- LX-03: `scripts/db/bootstrap_local.sql` (roles `anon`, `authenticated`, `lancex_app`) y `apply_local` (sh y ps1).
- LX-13: `seed_demo`.
- Eres la única persona que ejecuta `supabase db push`; registra la salida de `supabase migration list` en tu bitácora.

## Handoffs activos

Ninguno registrado todavía.

## Plantilla

- Fecha/hora:
- Issue/PR:
- Para rol:
- Estado: bloqueado / requiere revisión / listo para consumir
- Contexto:
- Archivos, tablas o endpoints afectados:
- Acción requerida:
- Cómo validar:

