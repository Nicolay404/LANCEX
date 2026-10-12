# Drivers arquitectónicos y escenarios de atributos de calidad

## Drivers

**Funcionales clave:** pujar con reglas de cinco variantes (ascendente, proxy, sobre cerrado, inversa, vela), cerrar y determinar ganador de forma reproducible, proteger información privada hasta su revelación.

**Restricciones:**

- R1. Equipo de tres personas, proyecto académico de un semestre.
- R2. Frontend y backend en local; nube limitada a Supabase y Firebase (ADR-0004).
- R3. Una única base PostgreSQL compartida por tres backends (ADR-0003, ADR-0004).
- R4. Sin pagos reales ni datos de tarjetas.
- R5. Costo de infraestructura: planes gratuitos.

**Atributos de calidad priorizados** (ISO/IEC 25010): 1) integridad y corrección funcional, 2) confidencialidad y control de acceso, 3) trazabilidad/verificabilidad, 4) modificabilidad, 5) tolerancia a fallos, 6) eficiencia de desempeño.

## Escenarios

Formato: fuente, estímulo, artefacto, entorno, respuesta y medida. Cada escenario tiene una prueba asociada que debe existir antes de dar por terminada la fase correspondiente.

### QA-01 Integridad bajo concurrencia

- **Fuente:** 20 usuarios repartidos entre 3 backends locales.
- **Estímulo:** 20 pujas válidas simultáneas sobre la misma subasta ascendente.
- **Artefacto:** servicio `place_bid` + PostgreSQL.
- **Entorno:** operación normal, subasta activa.
- **Respuesta:** las pujas se serializan; las que quedan por debajo del nuevo mínimo se rechazan con `BID_BELOW_MINIMUM`.
- **Medida:** 0 inconsistencias: `seq` contiguo sin huecos ni duplicados, `auction.bid_count` = filas en `bid`, `current_price` = máximo de `bid.amount`, un solo líder.
- **Táctica:** bloqueo pesimista por fila (`SELECT ... FOR UPDATE`), contador de secuencia en la misma transacción.
- **Prueba:** `tests/concurrency/test_parallel_bids.py` (hilos + `transaction=True`).

### QA-02 Confidencialidad de información privada

- **Fuente:** usuario autenticado que no es el dueño del dato, o visitante.
- **Estímulo:** consulta todos los endpoints de una subasta con proxy, reserva, sobre cerrado o vela.
- **Artefacto:** serializadores, logs de Firestore, `audit_event.data`.
- **Entorno:** subasta activa (antes de la revelación).
- **Respuesta:** ningún valor privado aparece.
- **Medida:** 0 apariciones del literal secreto (máximo proxy, reserva, oferta sellada, semilla) en respuestas JSON y en los registros capturados de logging.
- **Táctica:** serializadores por audiencia, `SensitiveDataFilter`, tablas separadas para datos privados.
- **Prueba:** `tests/security/test_no_leaks.py`.

### QA-03 Corrección temporal

- **Fuente:** postor con el reloj de su laptop adelantado o atrasado.
- **Estímulo:** puja enviada 1 s después del fin efectivo.
- **Artefacto:** `TimeSource.db_now()`, `effective_status`.
- **Entorno:** tres backends con relojes distintos.
- **Respuesta:** puja rechazada con `AUCTION_NOT_ACTIVE`.
- **Medida:** 100 % de rechazos, independientemente del reloj local; ninguna regla usa la hora de Python.
- **Prueba:** subasta con `ends_at = now() - interval '1 second'` en la base + revisión estática (`ruff` regla prohibida o grep en CI de `timezone.now()` dentro de `domain/` y `services/`).

### QA-04 Tolerancia a fallos de Firebase

- **Fuente:** Firestore no disponible (sin red hacia Google o credencial inválida).
- **Estímulo:** 50 pujas durante la caída.
- **Artefacto:** `QueueHandler` de logging.
- **Respuesta:** las pujas se aceptan; los logs se escriben en consola; la auditoría se guarda en PostgreSQL.
- **Medida:** 0 pujas fallidas por causa del logging; latencia p95 de `POST /bids/` aumenta menos de 20 ms respecto al escenario normal.
- **Prueba:** handler de Firestore simulado que lanza excepción o tarda 5 s.

### QA-05 Desempeño percibido

- **Fuente:** 10 usuarios concurrentes desde Loja.
- **Estímulo:** pujas y polling de detalle cada 2 s.
- **Artefacto:** API Django + Supabase.
- **Respuesta:** la interfaz refleja una puja nueva en el siguiente ciclo de polling.
- **Medida:** p95 `GET /live/` < 400 ms; p95 `POST /bids/` < 800 ms; actualización visible en otros navegadores ≤ 3 s. (Medidas dominadas por la latencia de red hacia Supabase; se registran con `duration_ms` en los logs.)
- **Táctica:** endpoint `live/` mínimo con `ETag`/`304`, consultas sin N+1, índices.

### QA-06 Modificabilidad: nueva modalidad

- **Fuente:** desarrollador del equipo.
- **Estímulo:** agregar un mecanismo nuevo (por ejemplo subasta holandesa).
- **Artefacto:** `auctions/domain/mechanisms/`.
- **Respuesta:** se implementa como una clase nueva registrada en `MECHANISMS`.
- **Medida:** 0 cambios en `services/place_bid.py`, vistas y modelos comunes; solo archivos nuevos + registro + SQL para sus parámetros.
- **Táctica:** Strategy + registro, núcleo de dominio sin Django.

### QA-07 Verificabilidad del resultado

- **Fuente:** participante o docente.
- **Estímulo:** solicita verificar el resultado de una subasta cerrada.
- **Artefacto:** libro `bid`, `audit_event`, `candle-proof`.
- **Respuesta:** el resultado se recalcula desde datos persistidos; en vela, el instante se recalcula desde la semilla revelada.
- **Medida:** 100 % de coincidencia entre el recálculo y `auction.winner_*`/`final_price` en todas las subastas cerradas de la base de pruebas; `scripts/verify_candle.py` reproduce el instante exacto.

### QA-08 Idempotencia ante reintentos

- **Fuente:** cliente con red inestable.
- **Estímulo:** reenvía la misma puja 3 veces con el mismo `Idempotency-Key`; además, los tres backends ejecutan `close_due_auctions` a la vez.
- **Respuesta:** una sola puja registrada; un solo cierre.
- **Medida:** 1 fila en `bid`; 1 evento `auction_closed` por subasta.

### QA-09 Seguridad: control de acceso ante manipulación del cliente

- **Fuente:** usuario autenticado con rol `user` que controla su navegador.
- **Estímulo:** invoca desde la consola endpoints de moderación y administración, envía campos extra (`platform_role`, `winner_user_id`) y cambia IDs a objetos ajenos.
- **Artefacto:** permisos DRF, capacidades, serializadores de entrada, querysets.
- **Entorno:** operación normal.
- **Respuesta:** 403, 404 o `400 UNKNOWN_FIELD` según el caso; evento de seguridad en Firestore; ningún cambio en la base.
- **Medida:** 100 % de las combinaciones ruta × método × rol coinciden con `endpoint_matrix.yaml`; 0 vistas sin permiso declarado (system check).
- **Táctica:** deny by default, capacidades calculadas en el servidor, entrada estricta, autorización por objeto (ADR-0006).

## Trazabilidad escenario → decisión

| Escenario | ADR |
|---|---|
| QA-01, QA-08 | ADR-0005 |
| QA-02 | ADR-0002, ADR-0005, contrato API |
| QA-03 | ADR-0004, ADR-0005 |
| QA-04 | ADR-0002 |
| QA-05 | ADR-0004 |
| QA-06 | ADR-0005 |
| QA-07 | ADR-0005, reglas §5 |
| QA-09 | ADR-0006 |
