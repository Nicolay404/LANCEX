# ADR-0007: RLS con política exclusiva para `lancex_app`

- **Estado:** aceptada (propuesta por IA, pendiente de revisión del equipo).
- **Fecha:** 2026-10-11.
- **Decisores:** equipo LANCEX.
- **Modifica:** ADR-0003, regla "`ENABLE ROW LEVEL SECURITY` sin políticas".

## Contexto

ADR-0003 pide activar RLS en todas las tablas **sin políticas**, como defensa en profundidad frente a la Data API de Supabase. Al implementar LX-02 se comprobó que, en PostgreSQL, RLS también se aplica a cualquier rol que no sea dueño de la tabla. `lancex_app` (el rol de Django) no es dueño: con RLS sin políticas, **Django no vería ni podría escribir ninguna fila**.

## Decisión

- RLS sigue activado en **todas** las tablas del esquema `lancex`.
- Cada tabla tiene **una sola política**, `lancex_app_backend`, `TO lancex_app USING (true) WITH CHECK (true)`.
- `anon` y `authenticated` (roles de la Data API) **no tienen grants ni políticas**: siguen sin acceso, que era el objetivo de ADR-0003.
- No se usa `BYPASSRLS` para `lancex_app` (en Supabase el rol `postgres` no siempre puede concederlo y amplía privilegios).

## Consecuencias

- (+) Django funciona con un rol sin DDL; la Data API sigue bloqueada (verificado por `tests/db/test_schema_guarantees.py`).
- (+) Si en el futuro se quisiera restringir filas por usuario en la base, ya existe el punto de extensión (políticas).
- (-) La protección de filas entre usuarios sigue estando en el backend (`visible_to`, servicios), no en RLS. Es lo que ya decía ADR-0006.
