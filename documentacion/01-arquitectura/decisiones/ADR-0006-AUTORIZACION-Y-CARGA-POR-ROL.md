# ADR-0006: Autorización por capacidades y carga de la interfaz por rol

- **Estado:** aceptada.
- **Fecha:** 2026-10-11.
- **Decisores:** equipo LANCEX.

## Contexto

LANCEX tiene siete tipos de usuario (`ROLES-Y-PERMISOS.md`) y datos que no pueden filtrarse. Requisitos del equipo:

1. Cada usuario carga **solo** las pantallas y funciones de su rol.
2. Nadie puede activar funciones adicionales manipulando el navegador (consola, React DevTools, editar el estado, llamar endpoints a mano, cambiar IDs en la URL).
3. Ningún dato sale del servidor hacia quien no debe verlo.

Hecho técnico ineludible: **todo el código que llega al navegador puede ser leído y ejecutado por el usuario.** Por tanto, la protección real no puede depender del frontend.

## Decisión

### 1. El backend es la única autoridad (deny by default)

- `REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"] = ["apps.core.permissions.DenyAll"]`. Cada vista declara explícitamente su permiso: `PublicRead` o `HasCapability("bid.place")`, etc.
- Un **system check de Django** recorre el URLConf al arrancar y falla si alguna vista no declara `required_capability` o `public = True`. Una vista nueva sin permiso no puede ni levantar el servidor.
- Las capacidades se calculan **en cada petición** desde la base (`user.platform_role`, `user.status`, membresías y estado de organizaciones), con caché solo dentro de la propia petición. Un cambio de rol surte efecto inmediato.
- Los **servicios** vuelven a validar las condiciones de objeto y estado (defensa en profundidad), porque también los llaman comandos y pruebas, no solo vistas.
- Los `QuerySet` se limitan en el servidor según el usuario (`Auction.objects.visible_to(user)`): nunca se devuelve una lista completa para que el frontend la filtre.

### 2. Contratos de entrada y salida estrictos

- Serializadores de **salida** por audiencia con lista blanca de campos (`fields = [...]`, nunca `__all__`). Un campo nuevo en el modelo no aparece en la API hasta que alguien lo agrega a propósito.
- Serializadores de **entrada** separados que solo aceptan los campos editables. Un `StrictInputMixin` **rechaza campos desconocidos** con `400 UNKNOWN_FIELD`: enviar `{"platform_role": "admin"}` o `{"winner_user_id": ...}` no se ignora en silencio, se rechaza y se registra como evento de seguridad.
- 404 para objetos no visibles (evita enumeración); 403 para acciones no permitidas sobre objetos visibles.

### 3. Frontend: rutas y código cargados según capacidades

- Al iniciar, la SPA llama a `GET /api/v1/auth/me`, que devuelve `capabilities` y las capacidades por organización. **Esa respuesta es la única fuente** para construir la interfaz; no se guarda rol ni capacidades en `localStorage`, `sessionStorage` ni cookies legibles por JS.
- El router se **construye dinámicamente**: una ruta solo se registra si el usuario tiene su capacidad. Una URL de otro rol (por ejemplo `/admin/usuarios`) no existe para ese usuario y muestra la página 404 genérica.
- El código se divide en **paquetes por grupo de rol** con `import()` dinámico (code splitting):

  | Paquete | Se descarga si el usuario tiene |
  |---|---|
  | `public` | siempre (catálogo, detalle, login, registro, ayuda) |
  | `user` | `bid.place` o `listing.manage_own` |
  | `org-buyer` | alguna organización con `auction.create_reverse` |
  | `org-supplier` | alguna organización con `reverse.register` |
  | `moderation` | `moderation.*` |
  | `admin` | `admin.*` |

  Un usuario normal nunca descarga el código de moderación ni de administración, y los textos con rutas de esos endpoints solo existen dentro de esos paquetes.
- Ante `401`: se limpia el estado y se vuelve al login. Ante `403`: se vuelve a pedir `/auth/me` (las capacidades pudieron cambiar) y se muestra "No tienes permiso".
- Al cerrar sesión: `queryClient.clear()` y **recarga completa** de la página para descartar de memoria los módulos y datos del rol anterior.
- Sin "modos ocultos": no existen `?debug=1`, banderas `VITE_ENABLE_ADMIN`, atajos de teclado secretos ni funciones expuestas en `window`.
- Build de producción: sin source maps, `esbuild.drop = ["console", "debugger"]`, sin dependencias de React DevTools.

### 4. Límite declarado y endurecimiento opcional

Aunque un paquete de otro rol no se cargue, en un build estático sus archivos JS siguen existiendo en el servidor de archivos y alguien podría descargarlos adivinando el nombre. Esto **no da acceso** a nada: ese código solo llama endpoints que el backend rechaza. En desarrollo local, además, el servidor de Vite expone todo el código fuente.

Para un despliegue real (fuera del alcance actual) se documenta el endurecimiento: servir los paquetes `moderation` y `admin` desde Django en una ruta que exige sesión con la capacidad correspondiente.

## Alternativas consideradas

- **Ocultar botones y confiar en que nadie llame la API:** descartado, es la vulnerabilidad clásica de control de acceso roto (OWASP A01).
- **Una SPA por rol:** aísla mejor el código, pero triplica el trabajo de build y navegación para tres personas.
- **JWT con roles dentro del token:** los roles quedarían congelados hasta que expire el token; con sesión y cálculo por petición, un cambio de rol o suspensión es inmediato.
- **Permisos de Django (`auth_permission`, grupos):** requieren tablas y migraciones de Django (ADR-0003) y no modelan bien las capacidades contextuales por organización.

## Consecuencias

- (+) Manipular el frontend no concede nada: como mucho muestra una pantalla cuyas llamadas fallan con 403/404.
- (+) Inventario de permisos verificable automáticamente (system check + prueba de inventario de endpoints).
- (+) Menor descarga para cada rol.
- (-) Cada vista requiere declarar su capacidad. Es el costo deseado.
- (-) Una consulta extra por petición para calcular capacidades; aceptable (membresías por usuario son pocas).
