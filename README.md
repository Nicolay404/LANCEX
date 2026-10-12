# LANCEX

**LANCEX** es una plataforma web de subastas multipropósito: ascendente con proxy bidding, sobre cerrado, inversa B2B y cierres fijos, extendibles (soft close) o aleatorios verificables (vela), sobre un único núcleo transaccional.

> Estado: **definición cerrada, listo para desarrollo** (2026-10-11). Aún no hay código de aplicación.

## Stack

| Capa | Tecnología | Dónde corre |
|---|---|---|
| Frontend | React + TypeScript + Vite | Local |
| Backend | Django + DRF | Local (cada integrante) |
| Base de datos | PostgreSQL (Supabase), esquema `lancex`, SQL + Supabase CLI | Nube, compartida |
| Imágenes | Supabase Storage | Nube |
| Logs técnicos | Firestore (Firebase) | Nube |

**Sin migraciones de Django**: el esquema vive en `supabase/migrations/` (ADR-0003).

## Por dónde empezar

1. Clona el repositorio:

   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd lancex
   git fetch --all --prune
   git switch main
   git pull --ff-only origin main
   ```

2. Lee, en este orden:
   - [`AGENTS.md`](AGENTS.md) (también si no usas IA: resume las reglas)
   - [`documentacion/00-contexto/CONTEXTO-GENERAL.md`](documentacion/00-contexto/CONTEXTO-GENERAL.md)
   - [`documentacion/00-contexto/PLAN-DE-DESARROLLO.md`](documentacion/00-contexto/PLAN-DE-DESARROLLO.md)
   - [`documentacion/01-arquitectura/ARQUITECTURA.md`](documentacion/01-arquitectura/ARQUITECTURA.md) y las [ADR](documentacion/01-arquitectura/decisiones/README.md)
   - Las reglas, el modelo y el contrato de tu fase en `documentacion/03-dominio/` y `04-api/`
3. Configura tu entorno: [`documentacion/07-operacion/CONFIGURACION-LOCAL.md`](documentacion/07-operacion/CONFIGURACION-LOCAL.md).
4. Toma una tarea `LX-xx` del plan, crea una rama corta, abre PR y actualiza documentación y bitácora.

## Ramas

- `main`: referencia integrada y protegida.
- `architect-lancex`, `backend-lancex`, `db-lancex`, `frontend-lancex`, `security-lancex`: ramas de rol.
- Ramas cortas por tarea: `feat/<rol>/LX-xx-tema`.
- `arq-lancex`: **no usar**; revisar si tiene commits únicos antes de archivarla.

Detalle: [`documentacion/02-equipo/FLUJO-GIT-Y-RAMAS.md`](documentacion/02-equipo/FLUJO-GIT-Y-RAMAS.md).

## Estructura

```text
lancex/
├── frontend/          # React + Vite (+ .env.example)
├── backend/           # Django + DRF (+ .env.example)
├── supabase/          # config.toml + migrations/*.sql (fuente de verdad del esquema)
├── scripts/           # db/ (aplicar SQL en local), verify_candle.py
├── documentacion/
├── AGENTS.md
└── README.md
```

## Principios no negociables

- El backend es la autoridad de las reglas de subasta; el navegador no accede a la base.
- PostgreSQL es la fuente de verdad de pujas, estados y resultados, y su reloj es la hora oficial.
- El esquema se cambia solo con migraciones SQL revisadas; nunca con migraciones de Django.
- Máximos proxy, ofertas selladas, reservas y semillas de vela no salen del servidor antes de tiempo.
- Una tarea no está terminada sin criterios de aceptación, pruebas, revisión y documentación.
- Ninguna IA puede afirmar que ejecutó una prueba si no existe evidencia.
