# Flujo Git y ramas de LANCEX

## Ramas existentes y uso acordado

| Rama | Propósito | Regla |
|---|---|---|
| `main` | Referencia integrada del producto | Protegida; solo entra código revisado con CI verde. |
| `architect-lancex` | ADR, arquitectura, contratos y coordinación | Sin cambios críticos invisibles; documentación común se integra a `main` con PR frecuente. |
| `backend-lancex` | API y reglas de dominio | Tareas pequeñas, pruebas y PRs hacia la rama de rol y luego a `main`. |
| `db-lancex` | Modelos, migraciones y datos | Migraciones revisadas; nunca solo cambios manuales remotos. |
| `frontend-lancex` | UI React | Consumir contratos acordados; probar compilación e interacciones. |
| `security-lancex` | Hallazgos y pruebas transversales de seguridad | Cada issue tiene un responsable de entre los tres integrantes. |
| `arq-lancex` | Duplicada/obsoleta por decisión inicial | No usar para trabajo nuevo. Comparar historial con `main` antes de eliminarla. |

## Recomendación práctica

Como ya existen ramas permanentes por rol, pueden conservarlas temporalmente para no interrumpir el trabajo. Aun así, usen ramas cortas por tarea cuando la tarea sea grande o necesite revisión independiente:

- `feat/backend/123-bid-validation`
- `feat/db/124-proxy-bid-limit`
- `feat/frontend/125-sealed-auction-view`
- `test/security/126-private-offer-access`
- `docs/architect/127-api-contract`

Flujo:

1. `git fetch origin` y actualizar la rama de rol desde `origin/main` según la regla del equipo.
2. Crear rama corta desde la rama de rol actualizada.
3. Trabajar en una sola issue y pedir a la IA un plan antes de editar.
4. Añadir pruebas y documentación afectada.
5. Revisar `git diff`, ejecutar pruebas y registrar el resultado en la bitácora propia.
6. PR hacia la rama de rol cuando se necesite revisión local; PR desde la rama de rol a `main` para integración común, o PR directo a `main` si el equipo decide simplificar el flujo. No mantener dos niveles de PR si eso solo añade burocracia.
7. Después de integrar, sincronizar las ramas de rol con `main` mediante merge regular. Para ramas compartidas, evitar rebase/force-push que reescriban trabajo de otra persona.

## Mi recomendación de mejora

A medio plazo, lo más sencillo es `main` protegida + ramas cortas por tarea, sin ramas permanentes de rol. Pero pueden migrar cuando el equipo esté preparado. Lo obligatorio ahora no es cambiar el nombre de las ramas: es integrar pronto para que las IA compartan documentación real y evitar divergencias grandes.

## Comunicación entre agentes y ramas

Un archivo actualizado dentro de `backend-lancex` no está disponible automáticamente para una IA trabajando desde `frontend-lancex`. La comunicación documental solo es compartida cuando los cambios llegan a la referencia común (normalmente `main`) o se comparten explícitamente en un PR. Por eso, los cambios de contrato, el estado compartido y los handoffs se deben integrar con frecuencia.

## Proteger `main`

Configurar en GitHub reglas compatibles con el plan del repositorio:

- bloquear push directo si es viable;
- requerir Pull Request y al menos una aprobación de otra persona;
- requerir comprobaciones de CI (tests, lint y build);
- bloquear force-push y borrado;
- habilitar eliminación automática de ramas de tarea ya fusionadas.

## Revisar `arq-lancex` antes de archivarla

```bash
git fetch origin
git log --oneline origin/main..origin/arq-lancex
git diff --stat origin/main...origin/arq-lancex
```

Si hay commits únicos, revisarlos y decidir si se integran. No eliminar la rama solo por tener un nombre similar.

## Flujo específico para cambios de esquema

1. Rama `feat/db/LX-xx-tema` (o la rama de la tarea de backend que lo necesite).
2. `supabase migration new <nombre>` y SQL probado en Postgres local.
3. PR con SQL + modelo `managed = False` + `MODELO-DE-DATOS-INICIAL.md`; revisión de BD y de backend.
4. Merge a `main`.
5. El responsable de BD ejecuta `supabase db push` y registra el resultado.
6. Las demás ramas hacen merge de `main` antes de usar el cambio.

Nunca se aplica al proyecto compartido una migración que no esté en `main`. Ver `07-operacion/GESTION-DEL-ESQUEMA.md`.
