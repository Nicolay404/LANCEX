# LANCEX: contexto general del proyecto

- **Nombre:** LANCEX.
- **Tipo:** plataforma web de subastas multipropósito con reglas explícitas y resultados verificables.
- **Contexto:** proyecto de la materia de Arquitectura de Software (UTPL). Moneda USD, usuarios en Ecuador.
- **Estado:** definición cerrada (2026-10-11); listo para iniciar desarrollo según `PLAN-DE-DESARROLLO.md`.
- **Equipo:** tres integrantes con roles de arquitectura/backend, base de datos y frontend; seguridad es transversal.

## Problema

Las subastas en línea informales (grupos de redes sociales, remates presenciales) no tienen reglas explícitas, no dejan rastro verificable y no protegen la información de cada participante. LANCEX ofrece un único núcleo donde compradores, vendedores y organizaciones participan en distintos mecanismos de subasta con reglas publicadas antes de empezar, resultados reproducibles y privacidad de lo que debe ser privado.

## Propuesta de valor

1. **Varios mecanismos sobre el mismo núcleo:** ascendente, inversa B2B y sobre cerrado, con cierres fijos, extendibles o aleatorios verificables.
2. **Confianza verificable:** cada resultado se reconstruye desde el libro de pujas y la auditoría; el cierre por vela se comprueba con commit-reveal.
3. **Privacidad por diseño:** máximos proxy, ofertas selladas y precios de reserva nunca salen del servidor antes de tiempo.

## Casos de uso de demostración

- **Remates de bienes** (vehículos, tecnología, maquinaria, muebles): subasta ascendente con proxy, soft close o vela, y sobre cerrado para lotes de mayor valor.
- **Compras de insumos para pymes:** subasta inversa B2B entre organizaciones verificadas.

## Modalidades

| Modalidad | Tipo | Resumen |
|---|---|---|
| Ascendente | Mecanismo | Pujas crecientes con incremento mínimo; gana la más alta. |
| Proxy bidding | Capacidad de la ascendente | Máximo privado; el sistema puja por el usuario hasta su límite. |
| Soft close | Política de cierre | Una puja en los últimos minutos extiende el cierre (anti-sniping). |
| Sobre cerrado | Mecanismo | Ofertas privadas hasta el cierre; gana la más alta a su propio precio (primer precio). |
| Inversa B2B | Mecanismo | Un comprador publica una necesidad; proveedores calificados compiten a la baja. |
| Vela | Política de cierre | Cierre aleatorio dentro de una ventana, fijado y comprometido antes de empezar y verificable al cerrar. |

Especificación completa: `03-dominio/REGLAS-DE-SUBASTAS.md`.

## Arquitectura (resumen)

- Monolito modular en capas: React + TS + Vite → Django + DRF → PostgreSQL en Supabase.
- Frontend y backend se ejecutan en local; en la nube solo Supabase (PostgreSQL y Storage) y Firebase (Firestore para logs).
- Esquema en SQL versionado con Supabase CLI; **sin migraciones de Django**.
- Pujas transaccionales serializadas por subasta; hora de negocio de PostgreSQL; cierre perezoso e idempotente.
- Autorización por capacidades calculadas en el servidor; cada rol descarga solo sus pantallas.
- Detalle: `01-arquitectura/ARQUITECTURA.md` y ADR-0001 a ADR-0006.

## Principios del sistema

- El servidor y PostgreSQL son la autoridad sobre la validez y el orden de las pujas.
- Nunca se confía en importes, máximos, estados ni horas enviados por el navegador.
- Importes en decimal exacto, nunca `float`.
- Instantes con zona horaria; la hora de referencia es la de PostgreSQL.
- Datos privados fuera de respuestas públicas, logs y auditoría hasta su revelación.
- Resultados reconstruibles desde datos persistidos.
- Reglas congeladas al publicar.
- La IA no sustituye la revisión humana ni las pruebas.

## Fuera de alcance

- Custodia o movimiento de dinero real, pasarelas de pago, datos de tarjetas.
- Logística y envíos.
- Blockchain.
- Microservicios y despliegue en servidores.
- IA para decidir ganadores o acusar fraude.
- Contratación pública real (la subasta inversa es entre privados y no sustituye a SERCOP).
- Aplicación móvil nativa.

## Decisiones que antes estaban pendientes (resueltas)

| Pregunta | Decisión | Dónde |
|---|---|---|
| Variante sellada | Primer precio, editable y retirable hasta el cierre | Reglas §6 |
| Desempates | `seq` menor en todas las modalidades | Reglas §1 |
| Moneda, impuestos, fórmula B2B | USD, sin IVA, `total = unit_price × quantity + shipping_cost` | Reglas §1 y §7 |
| Cancelación | Tabla de cancelación por actor y estado | Reglas §9 |
| Vela | Commit-reveal con HMAC-SHA256, corte retroactivo | Reglas §5 |
| Hosting | Ejecución local; Supabase y Firebase en la nube | ADR-0004 |
| Autenticación | Sesión de Django + CSRF vía proxy de Vite | ADR-0004 |
| Logs | Firestore (técnicos) y PostgreSQL (auditoría), retención 30 días en Firestore | ADR-0002 |
| Esquema | SQL + Supabase CLI, sin migraciones de Django | ADR-0003 |
| Tiempo real | Polling con versión y `304` | ADR-0004 |

## Documentación complementaria

- Plan: `00-contexto/PLAN-DE-DESARROLLO.md`
- Visión: `00-contexto/VISION-Y-ALCANCE.md`
- Arquitectura: `01-arquitectura/ARQUITECTURA.md`, `ATRIBUTOS-DE-CALIDAD.md`, `decisiones/`
- Equipo: `02-equipo/ROLES-Y-RESPONSABILIDADES.md`, `FLUJO-GIT-Y-RAMAS.md`
- Dominio: `03-dominio/REGLAS-DE-SUBASTAS.md`, `ROLES-Y-PERMISOS.md`, `FUNCIONAMIENTO-DEL-SISTEMA.md`, `MODELO-DE-DATOS-INICIAL.md`
- Interfaz: `08-interfaz/PANTALLAS-Y-NAVEGACION.md`
- API: `04-api/CONTRATO-API-INICIAL.md`
- Calidad y seguridad: `05-calidad/PRUEBAS-Y-SEGURIDAD.md`, `SEGURIDAD-Y-AUTORIZACION.md`
- IA: `06-ia/PROTOCOLO-DE-IA.md`, `COMUNICACION-ENTRE-IAS.md`
- Operación: `07-operacion/CONFIGURACION-LOCAL.md`, `GESTION-DEL-ESQUEMA.md`
