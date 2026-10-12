# Protocolo de trabajo con IA: LANCEX

## Objetivo

Usar asistentes de programación para acelerar análisis, implementación y pruebas sin convertir sus respuestas en una fuente de verdad no verificada.

## Contexto obligatorio que debe leer la IA

1. `/AGENTS.md`
2. `documentacion/00-contexto/CONTEXTO-GENERAL.md` y `PLAN-DE-DESARROLLO.md`
3. `documentacion/01-arquitectura/ARQUITECTURA.md` y las ADR de `decisiones/`
4. `documentacion/06-ia/ESTADO-COMPARTIDO.md`
5. El handoff y la bitácora de su rol.
6. Los contratos y reglas relacionados con el issue (`REGLAS-DE-SUBASTAS.md`, `MODELO-DE-DATOS-INICIAL.md`, `CONTRATO-API-INICIAL.md`).
7. El código y las pruebas existentes.

Si el agente trabaja desde una rama cuya documentación es más antigua que `main`, debe señalarlo y sincronizar antes de basar decisiones en información obsoleta.

## Reglas de base de datos para agentes

LANCEX **no usa migraciones de Django** (ADR-0003). Esta regla prevalece sobre cualquier costumbre o plantilla de Django que el agente conozca.

| Situación | Lo que hace el agente | Lo que nunca hace |
|---|---|---|
| Necesita una tabla o columna nueva | Crea un archivo nuevo con `supabase migration new <nombre>`, escribe el SQL siguiendo las convenciones de ADR-0003, actualiza el modelo Django con `managed = False`, actualiza `MODELO-DE-DATOS-INICIAL.md` y deja handoff a BD | `makemigrations`, `migrate`, crear `migrations/` |
| Necesita probar su SQL | Lo aplica al PostgreSQL local con `scripts/db/apply_local` | Ejecutarlo en el proyecto Supabase compartido |
| Encuentra un error en una migración ya aplicada | Crea una migración correctiva nueva | Editar la migración existente |
| Necesita datos de prueba | Usa factories en pruebas o el comando `seed_demo` (DML) | `loaddata`, `flush`, inserciones manuales sin script |
| Necesita la hora actual en una regla | Usa `TimeSource.db_now()` | `timezone.now()` / `datetime.now()` |
| Necesita una credencial | Pide al humano que la configure en su `.env` | Leer, pedir o pegar el `.env` en el chat |

Comandos que un agente **no ejecuta jamás** (ni sugiere ejecutar al humano contra la base compartida): `python manage.py makemigrations`, `python manage.py migrate`, `python manage.py flush`, `python manage.py sqlflush`, `python manage.py createsuperuser`, `python manage.py loaddata`, `supabase db push`, `supabase db reset --linked`, cualquier `DROP`/`TRUNCATE`/`ALTER` contra el proyecto compartido.

## Ciclo obligatorio por issue

1. El humano define un issue (`LX-xx`) con objetivo, alcance y criterios de aceptación.
2. La IA inspecciona el estado actual y propone plan, archivos afectados, pruebas y riesgos.
3. El humano aprueba o corrige el plan.
4. La IA implementa un cambio pequeño. Sin refactorizaciones masivas ajenas a la tarea.
5. Se ejecutan pruebas y comprobaciones reales (contra Postgres local).
6. Se inspecciona el diff y se hace revisión humana cruzada.
7. Se actualizan docs, handoff/estado compartido y bitácora del rol.
8. Se abre PR con evidencia, limitaciones y dependencias.

## Plantilla corta de prompt

```text
Lee AGENTS.md, PROTOCOLO-DE-IA.md, el estado compartido y la documentación vinculada al issue LX-__.
Tarea: [una funcionalidad concreta].
Criterios de aceptación: [lista observable].
Recuerda: el esquema se gestiona con SQL en supabase/migrations; NO uses migraciones de Django;
los modelos son managed = False; la hora de negocio sale de PostgreSQL.
Antes de editar, inspecciona el código y presenta un plan con archivos afectados, riesgos y pruebas.
Respeta el contrato de API y los límites de módulo (api → services → domain). No inventes endpoints.
Implementa el cambio mínimo necesario y añade pruebas de caso normal, error y abuso cuando corresponda.
Al final informa comandos ejecutados, resultados reales, archivos modificados, riesgos y handoff.
Actualiza tu bitácora con fecha/hora real generada por el entorno.
```

## Reglas innegociables

- No exponer claves, tokens, datos personales ni registros privados en prompts.
- No pegar el `.env`, el JSON de la cuenta de servicio de Firebase ni dumps de datos.
- No permitir que la IA decida reglas ambiguas: si algo no está en `REGLAS-DE-SUBASTAS.md`, se marca como pendiente y se consulta.
- No aceptar código no comprendido por el responsable humano.
- No eliminar pruebas para hacer verde el pipeline.
- No aceptar una revisión de IA como única revisión de un cambio sensible.
- Distinguir hecho verificado, inferencia, propuesta y pendiente.
- No afirmar que se ejecutó una prueba sin que el comando se haya ejecutado.

## Bitácora

Cada rol mantiene su archivo dentro de `documentacion/06-ia/bitacoras/`. Se registra el inicio y cierre de tareas relevantes, decisiones, pruebas y handoff. El timestamp se obtiene del entorno, en ISO-8601 con offset de Ecuador (`-05:00`).

PowerShell:

```powershell
Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz"
```

Bash:

```bash
TZ=America/Guayaquil date --iso-8601=seconds
```

Cada IA modifica solo la bitácora de su rol. Las actualizaciones se incluyen en el mismo PR que el trabajo. La bitácora es un registro del equipo, no un sustituto del historial de Git.
