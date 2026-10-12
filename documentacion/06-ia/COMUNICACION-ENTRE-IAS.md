# Protocolo de comunicación entre las IA del equipo

## Idea central

Las IA de diferentes integrantes no comparten memoria privada entre sí. La memoria común real es el repositorio: archivos versionados, issues, commits, Pull Requests, contratos, ADR, estado compartido y handoffs. Una nota en una rama no llega automáticamente a las demás ramas.

## Antes de iniciar una tarea

Cada IA debe:

1. Hacer `git fetch origin`.
2. Leer la documentación común vigente en `main` o comprobar si su rama está desactualizada.
3. Leer `ESTADO-COMPARTIDO.md` y el handoff de los módulos que va a tocar.
4. Revisar issues y PRs abiertos que puedan afectar al mismo archivo, modelo o contrato.
5. Registrar inicio, objetivo, rama, issue y dependencias en la bitácora del rol.

## Durante la tarea

- Si el contrato cambia, el agente debe actualizarlo y avisar en el estado/handoff.
- Si necesita un archivo o decisión de otro rol, debe escribir una solicitud de handoff con pregunta concreta, no cambiar unilateralmente ese módulo.
- Si descubre un riesgo de seguridad o un supuesto incorrecto, detener el cambio que dependa de ello y documentarlo.
- No usar la bitácora de otra persona para escribir sus propias acciones.

## Al terminar

- Añadir resumen de trabajo, archivos, pruebas reales, decisiones y pendientes a la bitácora propia.
- Actualizar el handoff del propio rol si hay trabajo pendiente para otro integrante.
- Actualizar `ESTADO-COMPARTIDO.md` solo si cambia el estado general o una decisión compartida; preferiblemente el coordinador integra el resumen para evitar conflictos.
- Incluir la documentación en el PR.
- Integrar pronto a la referencia común: un PR sin fusionar no es todavía contexto disponible para otras IA que solo leen `main`.

## Formato de handoff

```markdown
## Handoff: [ISSUE/PR]
- Fecha/hora:
- De rol:
- Para rol:
- Estado: bloqueado / requiere revisión / listo para consumir
- Contexto mínimo:
- Contrato/archivos afectados:
- Decisión que necesita respuesta:
- Cómo validar la integración:
- Enlaces a issue y PR:
```

## Resolución de contradicciones

Si dos bitácoras o documentos discrepan:

1. No asumir qué IA tiene razón.
2. Verificar issue, PR y código fusionado.
3. Identificar la decisión vigente en ADR/contrato.
4. El coordinador de arquitectura convoca acuerdo humano si no existe decisión.
5. Actualizar la documentación canónica y anotar la corrección con una nueva entrada; no borrar silenciosamente el historial anterior.

## Evitar conflictos de merge

Cada rol escribe en un archivo propio: `bitacoras/architect.md`, `backend.md`, `database.md`, `frontend.md` o `security.md`. No hacer que las cinco IA editen el mismo archivo de log. El estado compartido tiene un responsable de integración y cambios pequeños.

## Cambios de esquema entre IAs

Como no hay migraciones de Django (ADR-0003), un cambio de esquema solo existe para los demás cuando:

1. El archivo SQL nuevo está en `supabase/migrations/` dentro de `main`, y
2. El responsable de BD lo aplicó con `supabase db push` y lo registró en su bitácora.

Hasta entonces, cualquier IA que dependa de esa columna o tabla debe marcar su tarea como **bloqueada** en el handoff, no simular la columna ni crearla por su cuenta en la base compartida.
