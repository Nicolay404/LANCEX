# Backend LANCEX

**Stack:** Python 3.12+ + Django 5.2 LTS + Django REST Framework + drf-spectacular + psycopg 3. Base de datos PostgreSQL en Supabase (esquema `lancex`, rol `lancex_app`). Logs técnicos en Firestore. Versiones exactas en `requirements.txt` / `requirements-dev.txt`.

> **Sin migraciones de Django.** Los modelos usan `managed = False` y el esquema vive en `supabase/migrations/` (ADR-0003). `manage.py` rechaza `makemigrations`, `migrate`, `flush`, `sqlflush`, `loaddata` y `createsuperuser`.

## Responsabilidad

- Validar identidad, permisos y todas las reglas del dominio.
- Ser la única vía de escritura para pujas, límites proxy, ofertas selladas, inscripciones y estados de subasta.
- Serializar pujas concurrentes por subasta con transacciones y bloqueo de fila.
- Registrar la auditoría de negocio en PostgreSQL y los logs técnicos en Firestore.
- Publicar el contrato OpenAPI y errores estructurados.

## Estilo arquitectónico

**Monolito modular en capas** (ADR-0001), organizado por dominios, con **núcleo de dominio puro** al estilo hexagonal: el dominio no conoce Django y recibe la hora y los datos desde fuera.

```text
api (vistas, permisos, serializadores por audiencia)
  └─▶ services (casos de uso transaccionales, revalidan permisos y estado)
        └─▶ domain (Python puro: reglas, Strategy, máquina de estados)
infraestructura: models (managed=False), core.time, core.logging, audit
```

Reglas de dependencia verificadas por pruebas (`tests/architecture/`): `api → services → domain`; `domain` no importa Django; ninguna app importa la capa `api` de otra; servicios y dominio no leen el reloj de la laptop; ningún `fields = "__all__"`; ningún directorio `migrations/`; todo modelo `managed = False` con `db_table`.

## Patrones usados

| Patrón | Dónde | Para qué |
|---|---|---|
| Capas + módulos por dominio | `apps/<dominio>/{api,services,domain}` | Separar HTTP, casos de uso y reglas |
| Puerto/adaptador | `core.time.Clock` / `TimeSource`; `LANCEX_PRINCIPAL_LOADER` | Hora de PostgreSQL inyectable; `core` no depende de apps de dominio |
| Strategy + Registry | `auctions/domain/mechanisms`, `closing` (Fase 2) | Un mecanismo nuevo = una clase + registro |
| Decorator | `ProxyBidding` sobre `Ascending` (Fase 3) | Proxy combinable sin tocar el mecanismo |
| State machine | `effective_status` (Fase 2) | Estado efectivo y cierre perezoso |
| Factory de permisos | `HasCapability(...)`, `HasOrgCapability(...)`, `ByMethod(...)` | Permiso declarativo y verificable estáticamente |
| Deny by default + system check | `DenyAll`, `lancex.E001..E004` | Una vista sin permiso no arranca |
| Template method / mixin | `StrictInputMixin` | Entrada estricta con `UNKNOWN_FIELD` |
| Chain of responsibility | `RequestIdMiddleware` | Correlación `request_id` en respuesta, errores y logs |
| Productor-consumidor | `QueueHandler` + `BatchingQueueListener` | Logs a Firestore sin bloquear peticiones |
| Fitness functions | `tests/architecture/` | Las ADR como pruebas automáticas |

## Estructura

```text
backend/
├── manage.py                 # bloquea comandos prohibidos por ADR-0003
├── conftest.py               # django_db_setup sobrescrito (Postgres local preparado con SQL)
├── config/
│   ├── settings/{base,dev,test}.py
│   ├── urls.py               # handlers JSON + include de api_v1
│   └── api_v1.py             # registro de rutas /api/v1/
├── apps/
│   ├── core/                 # transversal (no depende de otras apps)
│   │   ├── capabilities.py   # catálogo y cálculo puro de capacidades (ROLES-Y-PERMISOS §3)
│   │   ├── permissions.py    # DenyAll, Public, HasCapability, HasOrgCapability, ByMethod
│   │   ├── checks.py         # lancex.E001..E004
│   │   ├── serializers.py    # StrictInputMixin
│   │   ├── errors.py         # jerarquía de errores (Python puro)
│   │   ├── exceptions.py     # traducción a {code, message, details, request_id}
│   │   ├── middleware.py     # request_id + request_completed
│   │   ├── time.py           # TimeSource.db_now() (reloj de PostgreSQL)
│   │   └── logging/          # SensitiveDataFilter, contexto, Firestore asíncrono
│   ├── accounts/             # User y UserSession (managed=False), SessionStore revocable, principal
│   ├── organizations/        # Organization, OrganizationMembership (managed=False)
│   ├── catalog/  auctions/{domain,services,api}  audit/  notifications/
└── tests/
    ├── architecture/         # reglas de las ADR como pruebas
    ├── core/  accounts/
    └── security/endpoint_matrix.yaml   # toda ruta nueva se agrega aquí
```

## Cómo declarar una vista

```python
from apps.core.capabilities import Cap
from apps.core.permissions import ByMethod, HasCapability, Public
from apps.core.serializers import StrictInputMixin

class BidInput(StrictInputMixin, serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)

class BidListView(APIView):
    permission_classes = [ByMethod(GET=Public, POST=HasCapability(Cap.BID_PLACE))]
```

Los servicios lanzan errores de `apps.core.errors` (`Conflict(code="BID_BELOW_MINIMUM", details=...)`); el manejador los traduce al formato del contrato. Nunca `timezone.now()` en reglas: `apps.core.time.time_source.db_now()`.

## Comandos

```bash
python -m pip install -r requirements-dev.txt
python manage.py check                 # incluye lancex.E001..E004
python -m pytest                       # unitarias + arquitectura; las de BD se omiten si no hay Postgres local
LANCEX_REQUIRE_DB=1 python -m pytest   # CI: falla si falta el Postgres local
ruff check . && ruff format --check .
python manage.py emit_test_log         # verifica el envío real a Firestore
```

Arranque completo: `documentacion/07-operacion/CONFIGURACION-LOCAL.md`.
