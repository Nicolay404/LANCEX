# ADR-0001: Stack y arquitectura de LANCEX

- **Estado:** aceptada.
- **Fecha:** 2026-10-11.
- **Decisores:** equipo LANCEX.

## Contexto

LANCEX requiere modalidades de subasta con reglas distintas, datos sensibles, pujas concurrentes, cierres y un equipo de tres personas. La solución debe ser mantenible y facilitar el uso responsable de IA.

## Decisión

- Frontend: React + TypeScript + Vite.
- Backend: Python + Django + Django REST Framework.
- Persistencia: PostgreSQL en Supabase, esquema gestionado con SQL versionado y Supabase CLI, **sin migraciones de Django** (ADR-0003).
- Acceso a datos críticos: solo a través de la API de Django, que se conecta con el rol `lancex_app`.
- Logs técnicos en Firestore; auditoría de negocio en PostgreSQL (ADR-0002).
- Ejecución local de frontend y backend; autenticación por sesión; tiempo real por polling (ADR-0004).
- Arquitectura: **monolito modular en capas**, organizado por dominios, con núcleo de reglas en Python puro y Strategy por mecanismo (ADR-0005).
- Integración: GitHub con Pull Requests y CI.
- Pruebas: pytest + pytest-django, Vitest + Testing Library, Playwright y pruebas de concurrencia sobre PostgreSQL.

## Alternativas consideradas

- **Microservicios desde el inicio:** descartado por carga operativa y complejidad de consistencia innecesarias para el tamaño del equipo.
- **Frontend escribiendo directamente en Supabase:** descartado para operaciones críticas; las reglas requieren validación transaccional centralizada.
- **Un servicio por modalidad:** descartado; comparten identidad, tiempo, auditoría y persistencia.
- **NestJS o FastAPI en el backend:** viables, pero Django aporta sesión, ORM y ecosistema DRF/OpenAPI listos, lo que reduce el trabajo de infraestructura para tres personas.

## Consecuencias

- Las modalidades se implementan como políticas dentro del backend modular.
- El núcleo de pujas puede probarse sin interfaz ni base de datos.
- Los límites entre módulos (ADR-0005, decisión 5) deben respetarse para no crear un monolito desordenado.
- La decisión se revisa solo si el alcance real justifica otra arquitectura, mediante una ADR nueva.
