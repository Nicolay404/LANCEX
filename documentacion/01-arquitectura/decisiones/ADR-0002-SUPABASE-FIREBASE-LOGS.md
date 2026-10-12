# ADR-0002: Logs técnicos en Firestore y auditoría en PostgreSQL

- **Estado:** aceptada.
- **Fecha:** 2026-10-11 (reemplaza la versión inicial de esta ADR).
- **Decisores:** equipo LANCEX.

## Contexto

El equipo usa dos servicios en la nube: Supabase (PostgreSQL) y Firebase. Firebase se incorpora **para logs**. Como cada integrante ejecuta su backend en local, los logs de consola de una laptop no los ve nadie más; se necesita un lugar común donde los tres puedan revisar errores y comportamiento de los tres backends.

"Log" puede significar tres cosas distintas, y cada una tiene un destino diferente:

| Tipo | Ejemplo | Destino |
|---|---|---|
| Log técnico | error 500, latencia de un endpoint, fallo de conexión | **Firestore** |
| Auditoría de negocio | puja aceptada, subasta cerrada, ganador, revelación de sobres, acción de admin | **PostgreSQL, tabla `audit_event`** |
| Analítica de producto | "usuario vio subasta" | **No se implementa** |

## Decisión

### Firestore como almacén central de logs técnicos

- Colección `logs_tecnicos` en un proyecto Firebase del equipo. Base Firestore en modo nativo.
- El backend escribe con el **Admin SDK** (`firebase-admin` / `google-cloud-firestore`) usando una cuenta de servicio. El JSON de credenciales vive fuera del repo y se referencia con `GOOGLE_APPLICATION_CREDENTIALS`.
- **El frontend no usa Firebase.** Las reglas de seguridad de Firestore niegan todo acceso de cliente:

  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /{document=**} { allow read, write: if false; }
    }
  }
  ```

  El Admin SDK no pasa por estas reglas, así que el backend sigue escribiendo.
- Los tres integrantes acceden a los logs desde la consola de Firebase con su cuenta de Google (rol de lectura o superior en el proyecto).

### Envío asíncrono y tolerante a fallos

- Un log nunca bloquea ni hace fallar una puja. Se usa `logging.handlers.QueueHandler` + `QueueListener`: la petición deja el registro en una cola en memoria y un hilo aparte lo envía a Firestore en lotes (batch de hasta 20 registros o cada 2 s).
- Si Firestore no responde, el handler descarta el lote tras un reintento y escribe el error solo en consola. La consola (`stdout`) siempre recibe todos los logs.
- Variable `FIRESTORE_LOGS_ENABLED=false` desactiva el envío (útil en pruebas automatizadas, que nunca escriben a Firestore).

### Qué se envía

- A Firestore: nivel `WARNING` o superior, más un conjunto cerrado de eventos `INFO` relevantes: `request_completed` solo para endpoints de escritura (`POST/PUT/PATCH/DELETE`), `auction_closed`, `close_job_run`.
- A consola: todo desde `INFO` (o `DEBUG` si `DJANGO_DEBUG=True`).
- Motivo: la cuota diaria gratuita de escrituras de Firestore es limitada (revisar la cifra vigente en la documentación de cuotas). Tres backends registrando cada petición, más pruebas de carga, la agotan.

### Esquema del documento

```json
{
  "ts": "2026-10-11T18:20:31.512Z",
  "level": "WARNING",
  "logger": "lancex.bids",
  "event": "bid_rejected",
  "message": "Puja rechazada por importe mínimo",
  "dev": "nicolay",
  "env": "local",
  "request_id": "6f1c...",
  "user_id": "uuid o null",
  "method": "POST",
  "path": "/api/v1/auctions/{id}/bids/",
  "status": 409,
  "duration_ms": 84,
  "error_code": "BID_BELOW_MINIMUM",
  "auction_id": "uuid o null",
  "exception": "traza resumida o null",
  "expire_at": "2026-11-10T18:20:31.512Z"
}
```

- `dev` sale de la variable `DEV_NAME` y permite saber qué laptop generó el log.
- `path` se registra con plantilla (`{id}`), no con el valor, para agrupar.
- `request_id` lo genera un middleware por petición, se devuelve en la cabecera `X-Request-ID` y en los errores de la API, y se copia a `audit_event.request_id`. Así se cruza un error de Firestore con la auditoría de PostgreSQL.

### Lo que nunca se registra

Contraseñas, cookies, cabeceras `Authorization`/`Cookie`/`X-CSRFToken`, cuerpos completos de petición o respuesta, `max_amount` de proxy, importes de ofertas selladas antes de la revelación, precio de reserva, semilla de vela, correos electrónicos completos. Un filtro de logging (`SensitiveDataFilter`) elimina estas claves si aparecen en `extra`, y una prueba automática lo verifica.

### Retención

Política TTL de Firestore sobre el campo `expire_at` (= `ts` + 30 días). La auditoría de PostgreSQL no caduca.

### Auditoría de negocio en PostgreSQL

- Tabla `audit_event`, escrita **en la misma transacción** que el cambio que audita. Si la transacción falla, no queda auditoría falsa; si Firestore cae, la auditoría no se pierde.
- Append-only: `lancex_app` solo tiene `INSERT, SELECT`; un trigger rechaza `UPDATE` y `DELETE`.
- Detalle de columnas en `MODELO-DE-DATOS-INICIAL.md` y catálogo de acciones en `REGLAS-DE-SUBASTAS.md`.

## Alternativas consideradas

- **Logs técnicos en una tabla de Supabase:** más simple y con un solo proveedor, pero mezcla tráfico de logs con la base transaccional y no aísla fallos. Se descarta por decisión del equipo de separar responsabilidades.
- **Google Cloud Logging:** es el servicio de logs "correcto" de Google, pero exige configurar el proyecto GCP subyacente y facturación según el uso; Firestore es suficiente para el volumen del proyecto.
- **Firebase Analytics para logs:** descartado; es analítica de cliente, no logs de servidor.
- **Auditoría en Firestore:** descartado; el resultado de una subasta debe poder verificarse junto a los datos transaccionales.

## Consecuencias

- (+) Los tres ven los errores de los tres backends en un solo lugar.
- (+) Aislamiento de fallos: Firestore caído no afecta a las pujas (escenario de calidad QA-04).
- (-) Un proveedor y una credencial más. Mitigación: solo el backend la usa, nunca el navegador.
- (-) Cuota gratuita limitada. Mitigación: filtrado por nivel y eventos, y desactivado en pruebas.
