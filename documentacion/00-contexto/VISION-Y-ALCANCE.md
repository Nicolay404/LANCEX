# Visión, alcance y criterios de éxito

## Visión

Una plataforma de subastas web confiable y modular que aplica reglas visibles, protege la información privada y permite incorporar nuevas modalidades sin duplicar el núcleo de usuarios, catálogo, permisos, historial y resultados.

## Actores

| Actor | Puede |
|---|---|
| Visitante | Ver catálogo, detalle público, historial seudonimizado y resultados públicos. |
| Usuario (postor / vendedor) | Registrarse, publicar artículos, crear subastas ascendentes y selladas, pujar, fijar máximos proxy, seguir subastas, calificar tras el cierre. |
| Miembro de organización compradora | Publicar necesidades B2B, crear subastas inversas, calificar proveedores inscritos. |
| Miembro de organización proveedora | Inscribir a su organización y ofertar a la baja si fue admitida. |
| Moderador | Verificar organizaciones, atender reportes, cancelar subastas y suspender usuarios con motivo. Sin actividad comercial. |
| Administrador | Todo lo del moderador más gestión de usuarios y roles, categorías, auditoría y salud del sistema. Sin actividad comercial. |

Detalle de capacidades por rol: `03-dominio/ROLES-Y-PERMISOS.md`; pantallas: `08-interfaz/PANTALLAS-Y-NAVEGACION.md`.

Los roles comerciales y los roles técnicos del equipo no deben confundirse.

## Alcance del producto

1. Registro, sesión y perfil con reputación.
2. Organizaciones B2B con membresías y verificación.
3. Catálogo con categorías, búsqueda, filtros e imágenes.
4. Subasta ascendente con proxy bidding y cierre fijo, soft close o vela.
5. Subasta de sobre cerrado a primer precio.
6. Subasta inversa B2B con inscripción, calificación y fórmula de total.
7. Estado efectivo y cierre automático idempotente; resultado reproducible.
8. Seguimiento (watchlist) y notificaciones internas.
9. Contacto post-cierre, estado de liquidación y calificaciones.
10. Reportes de usuarios, moderación, auditoría de negocio, logs técnicos centralizados y panel de administración.
11. Pruebas automatizadas, OpenAPI y CI.

El orden de construcción está en `PLAN-DE-DESARROLLO.md`.

## Criterios de éxito

- Ninguna subasta tiene dos ganadores ni un ganador distinto al que se recalcula desde el libro de pujas (QA-01, QA-07).
- Una puja rechazada nunca aparece como aceptada.
- Máximos proxy, ofertas selladas, reservas y semillas de vela no son visibles antes de tiempo (QA-02).
- Los permisos se comprueban en el backend sobre cada objeto.
- Las reglas son correctas aunque los tres relojes locales difieran (QA-03).
- Una caída de Firebase no impide pujar (QA-04).
- Una instalación limpia arranca siguiendo `CONFIGURACION-LOCAL.md`.
- La CI ejecuta el conjunto de pruebas acordado en cada PR.
- Cada decisión relevante se rastrea a una ADR, un issue y un PR.
