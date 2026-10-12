# Documentación de LANCEX

Esta carpeta tiene dos lectores: el equipo humano y los agentes de IA. La documentación es parte del proyecto y se revisa junto al código.

## Orden de lectura

1. `00-contexto/CONTEXTO-GENERAL.md`
2. `00-contexto/VISION-Y-ALCANCE.md`
3. `00-contexto/PLAN-DE-DESARROLLO.md`
4. `01-arquitectura/ARQUITECTURA.md`
5. `01-arquitectura/ATRIBUTOS-DE-CALIDAD.md`
6. `01-arquitectura/decisiones/` (ADR-0001 a ADR-0006)
7. `02-equipo/ROLES-Y-RESPONSABILIDADES.md` y `FLUJO-GIT-Y-RAMAS.md`
8. `03-dominio/REGLAS-DE-SUBASTAS.md`
9. `03-dominio/ROLES-Y-PERMISOS.md` y `FUNCIONAMIENTO-DEL-SISTEMA.md`
10. `03-dominio/MODELO-DE-DATOS-INICIAL.md`
11. `08-interfaz/PANTALLAS-Y-NAVEGACION.md`
12. `04-api/CONTRATO-API-INICIAL.md`
13. `05-calidad/PRUEBAS-Y-SEGURIDAD.md` y `SEGURIDAD-Y-AUTORIZACION.md`
14. `06-ia/PROTOCOLO-DE-IA.md` y `COMUNICACION-ENTRE-IAS.md`
15. `06-ia/ESTADO-COMPARTIDO.md` y el handoff del rol que ejecuta la tarea
16. `07-operacion/CONFIGURACION-LOCAL.md` y `GESTION-DEL-ESQUEMA.md`

## Fuente de verdad por tema

| Tema | Documento canónico |
|---|---|
| Alcance y orden | `PLAN-DE-DESARROLLO.md` |
| Reglas de negocio | `REGLAS-DE-SUBASTAS.md` |
| Roles y permisos | `ROLES-Y-PERMISOS.md` + `tests/security/endpoint_matrix.yaml` |
| Pantallas | `PANTALLAS-Y-NAVEGACION.md` |
| Esquema | `supabase/migrations/*.sql` (y su reflejo en `MODELO-DE-DATOS-INICIAL.md`) |
| API | OpenAPI generado + `CONTRATO-API-INICIAL.md` |
| Decisiones técnicas | ADR en `01-arquitectura/decisiones/` |

## Regla de actualización

Si un PR cambia una decisión, regla, tabla, endpoint, permiso, variable de entorno o flujo de trabajo, actualiza los documentos afectados en el mismo PR. Si un documento y el código se contradicen, no se adivina: se abre una incidencia, se establece la fuente de verdad y se corrige la contradicción.
