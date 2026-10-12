# Bitácora de IA: Arquitectura

> Solo el rol de arquitectura agrega entradas. No editar entradas históricas: corregirlas mediante una nueva entrada.

## Plantilla de entrada

```markdown
## YYYY-MM-DDTHH:mm:ss-05:00: INICIO/CIERRE: ISSUE/PR
- Humano responsable:
- Herramienta/modelo IA (si se conoce):
- Rama y commit:
- Objetivo:
- Archivos/documentos modificados:
- Decisiones/supuestos:
- Pruebas ejecutadas y resultado real:
- Riesgos/bloqueos:
- Handoff/siguiente paso:
```

## 2026-10-11T13:16:54-05:00: CIERRE: definición completa (sin issue/PR todavía)
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: copia local de `main`, sin commit.
- Objetivo: cerrar la definición del proyecto antes de programar: alcance completo, stack, esquema sin migraciones de Django, logs en Firestore, reglas, modelo, contrato API, calidad y plan por roles.
- Archivos/documentos modificados: `AGENTS.md`, `README.md`, `.env.example`, `backend/.env.example` (nuevo), `frontend/.env.example` (nuevo), `backend/README.md`, `frontend/README.md`, `LANCEX_CONTEXTO_GENERAL.md` (ahora apunta al canónico), `MANIFEST.txt`, toda `documentacion/` (nuevos: `PLAN-DE-DESARROLLO.md`, `ATRIBUTOS-DE-CALIDAD.md`, ADR-0003, ADR-0004, ADR-0005, `decisiones/README.md`, `GESTION-DEL-ESQUEMA.md`).
- Decisiones/supuestos: decisiones del humano: sin migraciones de Django, solo Supabase y Firebase en la nube, backend/frontend en local, Firebase para logs, alcance completo. El resto (auth por sesión, polling, reglas numéricas, vela con commit-reveal, B2B con calificación previa) lo definió la IA por delegación explícita del humano y queda sujeto a revisión del equipo.
- Pruebas ejecutadas y resultado real: ninguna (solo documentación).
- Riesgos/bloqueos: verificar en la práctica `search_path` con el pooler de Supabase y la cuota de Firestore.
- Handoff/siguiente paso: revisión en equipo; PR `docs/architect/definicion-completa`; iniciar Fase 0.

## 2026-10-11T13:39:46-05:00: CIERRE: roles, pantallas y seguridad (sin issue/PR todavía)
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: copia local de `main`, sin commit.
- Objetivo: definir tipos de usuario, capacidades, pantallas por rol, funcionamiento del sistema y controles para que nadie active funciones desde el navegador ni se filtren datos.
- Archivos/documentos modificados: nuevos `03-dominio/ROLES-Y-PERMISOS.md`, `03-dominio/FUNCIONAMIENTO-DEL-SISTEMA.md`, `08-interfaz/PANTALLAS-Y-NAVEGACION.md`, `05-calidad/SEGURIDAD-Y-AUTORIZACION.md`, ADR-0006; actualizados `AGENTS.md`, reglas (§13 a §15), modelo de datos, contrato API, ADR-0004, ADR-0005, calidad (QA-09), plan, visión, contexto, índices, `frontend/README.md`.
- Decisiones/supuestos: staff sin actividad comercial; moderador separado de admin; registro sin verificación de email (riesgo aceptado); bloqueo de login compartido vía `DatabaseCache`.
- Pruebas ejecutadas y resultado real: ninguna (solo documentación).
- Riesgos/bloqueos: revocar sesiones por usuario requiere `SessionStore` propio con `user_id` en `django_session`.
- Handoff/siguiente paso: BD agrega `report`, `django_cache`, `job_heartbeat` y columnas de `app_user` a la migración base (LX-02).
