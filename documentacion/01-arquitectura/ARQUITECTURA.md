# Arquitectura de LANCEX

Estilo: **monolito modular en capas**, organizado por dominios, con núcleo de reglas en Python puro. Sin microservicios. Decisiones detalladas en [`decisiones/`](decisiones/README.md); drivers y escenarios en [`ATRIBUTOS-DE-CALIDAD.md`](ATRIBUTOS-DE-CALIDAD.md).

## Por qué un monolito modular

- Tres personas desarrollan y entienden un único backend.
- Las reglas de puja, cierre, máximos y ganador necesitan transacciones dentro de una misma frontera de persistencia.
- Las modalidades comparten cuentas, organizaciones, catálogo, auditoría y resultados.
- Los módulos internos separan responsabilidades sin distribuir el sistema.

## C4 nivel 1: contexto

```mermaid
flowchart LR
    V[Visitante] -->|consulta subastas públicas| L
    U[Postor / vendedor] -->|publica, puja, consulta resultados| L
    B[Organización compradora] -->|publica necesidades B2B, califica proveedores| L
    P[Organización proveedora] -->|se inscribe y oferta a la baja| L
    A[Administrador] -->|verifica organizaciones, audita| L
    L[[LANCEX<br/>plataforma de subastas]]
    L -->|datos y auditoría| SB[(Supabase<br/>PostgreSQL + Storage)]
    L -->|logs técnicos| FB[(Firebase<br/>Firestore)]
    D[Equipo de desarrollo] -->|revisa logs| FB
```

## C4 nivel 2: contenedores

```mermaid
flowchart TB
    subgraph Laptop["Laptop de cada integrante (local)"]
        BR[Navegador]
        SPA["SPA React + TS<br/>servidor Vite :5173"]
        API["API Django + DRF :8000<br/>monolito modular"]
        JOB["close_due_auctions<br/>(comando Django en bucle)"]
    end
    subgraph Supabase["Supabase (nube)"]
        PG[("PostgreSQL<br/>esquema lancex")]
        ST[("Storage<br/>bucket listing-images")]
    end
    subgraph Firebase["Firebase (nube)"]
        FS[("Firestore<br/>logs_tecnicos")]
    end
    BR --> SPA
    SPA -->|"/api/* (proxy Vite, cookie de sesión + CSRF)"| API
    BR -->|subida/lectura con URL firmada| ST
    API -->|"psycopg 3, TLS, pooler modo sesión, rol lancex_app"| PG
    JOB --> PG
    API -->|URLs firmadas| ST
    API -->|"Admin SDK, asíncrono (QueueHandler)"| FS
    JOB -->|logs| FS
```

## C4 nivel 3: componentes del backend

```mermaid
flowchart TB
    subgraph api["Capa API (apps/*/api)"]
        V1[Views + HasCapability<br/>DenyAll por defecto]
        S1[Serializadores por audiencia<br/>Public / Participant / Owner / Moderation]
    end
    subgraph services["Capa de aplicación (apps/*/services)"]
        PB[place_bid]
        PUB[publish / cancel]
        CL[close_auction]
        SE[submit_sealed / participants]
        IMG[image_upload]
    end
    subgraph domain["Dominio puro (auctions/domain)"]
        MEC[Mechanisms<br/>Ascending, Reverse, SealedFirstPrice]
        PRX[ProxyBidding<br/>decorador]
        CLP[ClosingPolicies<br/>Fixed, SoftClose, Candle]
        STM[Máquina de estados<br/>effective_status]
    end
    subgraph infra["Infraestructura (core, models)"]
        ORM[Modelos managed=False]
        TS[TimeSource.db_now]
        AUD[audit.record]
        LOG[Logging Firestore + request_id]
        NOT[notifications]
    end
    V1 --> S1
    V1 --> services
    services --> domain
    services --> ORM
    services --> TS
    services --> AUD
    services --> NOT
    services -.on_commit.-> LOG
```

Regla de dependencias: `api → services → domain`. `domain` no importa Django. Ninguna app importa la capa `api` de otra.

## Capas

- **API/presentación:** vistas, permisos, serializadores por audiencia, traducción de errores de dominio a HTTP.
- **Aplicación:** casos de uso transaccionales (publicar, pujar, cerrar, inscribir, revelar).
- **Dominio:** mecanismos, políticas de cierre, proxy, estado efectivo, validaciones y selección de ganador.
- **Infraestructura:** modelos ORM sin migraciones, hora de PostgreSQL, auditoría, logs, notificaciones, Storage.

La lógica crítica no vive en serializadores, vistas ni componentes de React.

## Datos y autoridad

- Supabase PostgreSQL es la fuente de verdad. Esquema en SQL versionado (ADR-0003).
- Django se conecta como `lancex_app` (sin DDL). El navegador no accede a la base.
- La hora de negocio es la de PostgreSQL (ADR-0004).
- La auditoría vive junto a los datos transaccionales; los logs técnicos, en Firestore (ADR-0002).

## Concurrencia, cierre y tiempo real

Resumen de ADR-0005 y ADR-0004:

- Pujas serializadas por subasta con `SELECT ... FOR UPDATE`; orden por `seq`; idempotencia por `Idempotency-Key`.
- Estado efectivo calculado en cada lectura; cierre materializado por un job idempotente (`SKIP LOCKED`) que cualquiera de los tres backends puede ejecutar.
- Polling con versión y `304`; sin WebSockets ni Redis.

## Vista de despliegue

No hay despliegue en servidores propios. Cada integrante ejecuta SPA, API y job en su laptop; Supabase y Firebase son servicios gestionados compartidos. La demo se realiza desde una laptop designada con el mismo procedimiento de `CONFIGURACION-LOCAL.md`.
