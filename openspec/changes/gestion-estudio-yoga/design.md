# Design

## Context

El repositorio es un proyecto nuevo: solo contiene el scaffolding de OpenSpec y no hay código, base de datos ni configuración previa. Ver `proposal.md` para la motivación y `specs/` para el contrato de comportamiento.

Restricciones que condicionan el diseño:

- Un solo estudio, una sola zona horaria (`America/Argentina/Buenos_Aires`) y dos instructoras. El volumen es bajo; la prioridad es integridad, no escala horizontal.
- La base de datos es PostgreSQL y el control de cupo exige locks pesimistas, índices únicos parciales y triggers; no alcanza con una base embebida sin concurrencia real.
- La suite de aceptación debe correr con un comando, sin servicios externos y sin llamadas de red. El driver de WhatsApp y el de email deben tener implementaciones de log.
- No se modela dinero en ninguna capa.
- El número actual de WhatsApp del estudio no se toca: la integración usa un número nuevo configurado por variables de entorno.

El entorno de desarrollo tiene Node.js 22, npm 10 y Podman. El `compose.yaml` del proyecto levanta PostgreSQL 16 con persistencia en `data/postgres/pgdata`; la suite puede usar esa instancia mediante `TEST_DATABASE_URL` o un clúster efímero. No se usa pnpm.

## Goals / Non-Goals

**Goals:**

- Un único camino de escritura de créditos, con saldo derivado y auditable, defendido por la aplicación y por la base de datos.
- Reservas atómicas: cupo, débito y outbox en la misma transacción, sin sobreventa ni créditos retenidos.
- Lista de espera FIFO con ofertas que reservan el lugar y vencen por reloj, no por intervención manual.
- Autenticación passwordless de alumnas y autenticación con contraseña para staff, con autorización por rol y por pertenencia.
- Operación completa sin credenciales de Meta: el driver de log es el valor por defecto.
- Tests de aceptación ejecutables contra PostgreSQL real, desde una base vacía, con un solo comando.

**Non-Goals:**

- Escalar a múltiples sedes, idiomas, miles de reservas por minuto o múltiples tenants.
- Enviar emails transaccionales por un proveedor específico o gestionar plantillas de Meta desde la aplicación.
- Reemplazar la app de WhatsApp actual del estudio o migrar su número.
- Construir pagos, precios, facturación, tienda, videos, rutinas o chat.
- Generar automáticamente un calendario perpetuo: la administradora genera sesiones por rango.
- Alta disponibilidad, réplica de lectura o despliegue multi-región.

## Decisions

### 1. Monorepo con npm workspaces y tres procesos

```
apps/web        React + Vite (portal y panel)
apps/api        Fastify (HTTP, auth, casos de uso)
apps/worker     outbox, vencimiento de ofertas y paquetes
packages/core   dominio y servicios transaccionales
packages/db     esquema Drizzle, migraciones y triggers SQL
packages/shared contratos Zod, errores y utilidades de fecha
packages/testing factories y arranque de PostgreSQL efímero
```

- **Por qué**: API y worker comparten `core` y `db`, pero se despliegan y escalan por separado. El worker puede correr con una sola instancia sin acoplar su ciclo de vida al tráfico HTTP.
- **Alternativa descartada**: Next.js full-stack. Mezcla request HTTP y worker, y dificulta mantener las transacciones y el outbox fuera del ciclo de render.
- **Alternativa descartada**: pnpm. No está instalado en el entorno y npm workspaces cubre el caso sin una dependencia adicional.
- **Runtime**: Node.js 22, TypeScript estricto, ESM. `apps/api` sirve la SPA compilada en producción; en desarrollo Vite hace proxy a la API.

### 2. PostgreSQL 16 + Drizzle ORM + SQL explícito

- Drizzle para consultas tipadas y transacciones; SQL manual en migraciones para `FOR UPDATE`, índices parciales y triggers.
- **Por qué**: el dominio depende de semántica de PostgreSQL que un ORM de alto nivel no expresa bien. Drizzle deja convivir el tipado con SQL cuando hace falta.
- **Alternativa descartada**: Prisma. Requiere SQL crudo para locks y triggers, y añade un motor binario que complica el test efímero.
- **Conexión**: `pg` Pool con `max` configurable (25 en tests para permitir 20 requests concurrentes). `statement_timeout` y `lock_timeout` cortos (5 s) para que una transacción trabada falle rápido.

### 3. El saldo lo mantiene un trigger, no los controladores

`credit_movements` es la fuente de verdad. Un trigger `BEFORE INSERT`:

1. Ejecuta `UPDATE student_packages SET balance = balance + NEW.delta WHERE id = NEW.student_package_id AND balance + NEW.delta >= 0 RETURNING balance`.
2. Si no actualiza ninguna fila, lanza una excepción de saldo insuficiente.
3. Asigna `NEW.balance_after` con el saldo devuelto.
4. Ajusta el estado del paquete a activo, agotado o vencido según saldo y `expires_at`.

Ventajas:

- La aplicación no edita el saldo: solo inserta movimientos y el trigger lo actualiza.
- Dos débitos concurrentes sobre el mismo paquete se serializan por el `UPDATE` atómico; nunca queda negativo.
- `balance_after` es consistente por construcción, no por disciplina del servicio.
- La regla "un solo servicio escribe créditos" se refuerza con un límite de módulo: solo `packages/core/src/ledger` importa las tablas de créditos, tanto para leer como para escribir. Los controladores llaman a métodos del ledger y un test de arquitectura lo verifica.

Un trigger `BEFORE UPDATE OR DELETE` sobre `credit_movements` lanza una excepción. Los tests de aceptación intentan `DELETE` y `UPDATE` directos por SQL y esperan el error. No se usan permisos de base distintos porque el trigger protege incluso al rol dueño y es más simple de provisionar; en producción se puede endurecer además con un rol de aplicación sin `UPDATE/DELETE`.

**Alternativa descartada**: calcular el saldo con `SUM(delta)` en cada lectura y no persistirlo. Es correcto, pero el modelo pide `saldo` y `saldo resultante`, y la lectura seria más costosa. Se conserva como verificación de invariante, no como camino principal.

### 4. Modelo de datos

Enums en inglés en la base, traducidos a los términos del negocio en la API y la UI:

| Dominio | Código |
| --- | --- |
| confirmada | `confirmed` |
| en espera | `waitlisted` |
| ofrecida | `offered` |
| asistió | `attended` |
| ausente | `absent` |
| cancelada | `cancelled` |
| oferta vencida | `offer_expired` |
| compra / reserva / devolución / vencimiento / ajuste | `purchase` / `booking` / `refund` / `expiration` / `adjustment` |
| programada / cancelada / completada | `scheduled` / `cancelled` / `completed` |

Tablas e índices principales:

| Tabla | Columnas clave | Índices y restricciones |
| --- | --- | --- |
| `students` | `id`, `name`, `phone_e164`, `email`, `whatsapp_consent_at`, `created_at` | `phone_e164` único; email normalizado único parcial cuando no es nulo |
| `staff_users` | `id`, `name`, `email`, `password_hash`, `role`, `active` | email único; `role` en (`admin`, `instructor`) |
| `package_plans` | `id`, `name`, `credits`, `validity_days`, `active` | `credits > 0`; `validity_days > 0` o nulo |
| `student_packages` | `id`, `student_id`, `plan_id`, `credits_purchased`, `balance`, `purchased_at`, `expires_at`, `status` | `balance >= 0`; índice por alumna y vencimiento |
| `credit_movements` | `id`, `student_package_id`, `student_id`, `type`, `delta`, `balance_after`, `booking_id`, `class_session_id`, `actor_type`, `actor_id`, `reason`, `created_at` | `delta <> 0`; índice por paquete y fecha; único parcial `(booking_id, type)` para reserva y devolución |
| `class_templates` | `id`, `weekday` (1–7), `start_time`, `duration_minutes`, `capacity`, `instructor_id`, `active` | `capacity > 0`; `duration_minutes > 0` |
| `class_sessions` | `id`, `template_id`, `starts_at`, `duration_minutes`, `capacity`, `instructor_id`, `status`, `cancelled_at`, `cancelled_by` | único `(template_id, starts_at)`; índice por `starts_at` |
| `bookings` | `id`, `session_id`, `student_id`, `status`, `created_at`, `offer_expires_at`, `attended_at`, `cancelled_at`, `cancelled_by` | único parcial `(session_id, student_id)` para estados activos; índice `(session_id, status, created_at, id)` |
| `notifications` | `id`, `event`, `recipient_student_id`, `recipient_phone`, `template`, `payload`, `status`, `attempts`, `idempotency_key`, `next_attempt_at`, `locked_until`, `last_error`, `created_at`, `sent_at` | `idempotency_key` único; índice por estado y `next_attempt_at` |
| `auth_tokens` | `id`, `student_id` (nulo para email inexistente), `email_normalized`, `code_hash`, `expires_at`, `attempts`, `consumed_at`, `created_at`, `request_ip` | índice por email y fecha |
| `student_sessions` | `id`, `student_id`, `token_hash`, `expires_at`, `revoked_at`, `created_at` | `token_hash` único |
| `staff_sessions` | `id`, `staff_user_id`, `token_hash`, `expires_at`, `revoked_at`, `created_at` | `token_hash` único |

Decisiones de modelado:

- **Una sola reserva activa**: el índice parcial incluye `confirmed`, `waitlisted`, `offered`, `attended` y `absent`. `cancelled` y `offer_expired` liberan la combinación para una nueva reserva.
- **Una sola devolución**: el índice único parcial `(booking_id, type)` con `type IN ('booking','refund')` impide dos débitos o dos devoluciones para la misma reserva, incluso ante reintentos.
- **Sin créditos retenidos**: la oferta ocupa un lugar (se cuenta como `offered`) pero no descuenta crédito hasta la aceptación. El débito ocurre al confirmar.
- **Snapshot de sesión**: `class_sessions` copia cupo, duración e instructora al generarse; cambiar la plantilla no altera clases ya creadas.
- **Sin borrado de alumnas**: el historial de créditos es auditable; la gestión es alta y edición. Una baja lógica se puede agregar después sin romper datos.
- **Email normalizado**: se guarda en minúsculas y se compara normalizado; el email es único cuando existe. Un email opcional permite alumnas sin portal, que igual reciben WhatsApp.
- **`auth_tokens` con email inexistente**: se crea una fila señuelo con un hash aleatorio que nunca se envía. Así el límite de 3 por hora también aplica a contactos inexistentes y no se filtra su existencia.

### 5. Servicio de créditos y orden de consumo

`packages/core/src/ledger` expone solo operaciones de negocio, siempre dentro de una transacción del llamador:

- `recordPurchase(studentId, planId, purchasedAt)`: crea `student_package` con saldo 0 e inserta el movimiento `purchase +credits`; el trigger fija el saldo.
- `debitForBooking(studentId, bookingId, sessionId)`: selecciona paquetes activos con saldo, ordena por `expires_at NULLS LAST, purchased_at, id`, bloquea el elegido con `FOR UPDATE` e inserta `booking -1`. Si no hay paquete elegible, devuelve `INSUFFICIENT_CREDITS`.
- `refundForBooking(booking, reason)`: busca el movimiento `booking` de esa reserva, inserta `refund +1` en el mismo paquete. La restricción única evita duplicados. Si el paquete venció, el crédito queda en un paquete vencido y el barrido de vencimientos lo escribirá a 0 en la próxima pasada, sin extender la vigencia.
- `expirePackage(packageId)`: con el paquete bloqueado, inserta `expiration -balance`.
- `adjust(studentPackageId, delta, actorId, reason)`: valida actor administrador y motivo no vacío; inserta `adjustment`.
- `getBalance` y `listMovements`: lecturas; `getBalance` usa la suma de movimientos para el test de invariante y puede comparar contra la columna cacheada.

El orden FEFO se implementa en una sola consulta con `FOR UPDATE` sobre el primer paquete elegible. Si el paquete elegido se queda sin saldo entre la selección y el débito, el trigger aborta la transacción y el llamador puede reintentar la selección una vez; en la práctica el lock evita la carrera.

### 6. Motor de reservas y orden de locks

Todas las operaciones que afectan cupo bloquean primero la fila de `class_sessions` y después, si corresponde, la fila de `bookings`. Ese orden es obligatorio para evitar deadlocks:

```
reserve:          lock session → count → debit → insert booking → outbox
accept offer:     lock session → lock booking → debit → update booking → outbox
cancel booking:   lock session → lock booking → refund? → update → promote → outbox
cancel class:     lock session → lock all active bookings → refunds → updates → outbox
expire offer:     lock session → lock booking → recheck → update → promote → outbox
attendance:       lock booking (no cambia cupo)
```

**Reserva**

1. `SELECT ... FROM class_sessions WHERE id = $1 FOR UPDATE`.
2. Validar `status = scheduled` y `starts_at > now`.
3. Verificar que no exista reserva activa (el índice único también lo garantiza).
4. `SELECT count(*) ... WHERE session_id = $1 AND status IN ('confirmed','offered')`. El count ocurre dentro de la transacción y después del lock; nunca fuera.
5. Si hay lugar: `debitForBooking` + insertar `booking confirmed` + encolar aviso `booking_confirmed`.
6. Si no hay lugar: insertar `booking waitlisted`, sin débito y sin aviso obligatorio.
7. Commit. Cualquier fallo revierte cupo, crédito y aviso juntos.

**Oferta al liberarse un lugar**

`promoteIfAvailable(sessionId)` se ejecuta dentro de la transacción que liberó el lugar, con la sesión ya bloqueada:

1. Recontar `confirmed + offered`; si no hay lugar, terminar.
2. Recorrer `waitlisted` en orden `created_at, id` con `FOR UPDATE`.
3. Para cada candidata, verificar saldo vigente con una lectura del ledger. La primera con saldo pasa a `offered`, recibe `offer_expires_at = min(now + OFFER_WINDOW_MINUTES, starts_at)` y se encola `spot_offered`. Las ofertas nunca se extienden más allá del inicio de la clase. Las que no tienen saldo se saltean y conservan su posición.
4. Si ninguna tiene saldo, el lugar queda libre.

**Aceptar oferta**

1. Lock de sesión y de reserva; verificar `offered`, `offer_expires_at > now` y `starts_at > now`.
2. `debitForBooking`; si falla, marcar `offer_expired`, promover a la siguiente y devolver conflicto sin débito.
3. Si el débito funciona, pasar a `confirmed` y encolar `booking_confirmed`.

**Vencimiento de ofertas**

El worker selecciona reservas `offered` con `offer_expires_at <= now`, pero para cada una abre una transacción, bloquea la sesión y vuelve a verificar el estado antes de vencer y promover. Así dos workers no procesan la misma oferta ni generan dos promociones.

**Cancelación de la alumna**

Con la sesión y la reserva bloqueadas, se calcula `starts_at - now`:

- `>= 4 h` y reserva `confirmed`: `refundForBooking`.
- `< 4 h` y reserva `confirmed`: sin devolución.
- `offered`: sin devolución; se libera el lugar.
- `waitlisted`: se quita de la cola, sin efecto sobre el cupo.
- Después se actualiza a `cancelled` y se llama a `promoteIfAvailable` en la misma transacción. La cancelación repetida es idempotente: si ya está `cancelled`, no vuelve a devolver ni a promover.

No se permite cancelar una sesión que ya comenzó.

**Cancelación de clase**

La instructora asignada o la administradora bloquean la sesión, la pasan a `cancelled` y recorren las reservas activas:

- `confirmed`: `refundForBooking` y aviso `class_cancelled` con crédito devuelto.
- `offered` y `waitlisted`: pasan a `cancelled` y reciben aviso, sin devolución porque nunca se debitó.
- Se insertan todas las notificaciones en la misma transacción. Ninguna llamada de red ocurre en el request.

**Asistencia**

La instructora asignada (o la administradora) marca `attended` o `absent` sobre una reserva `confirmed` de una sesión que ya comenzó y no está cancelada. No se toca el ledger. Repetir la marcación devuelve el mismo estado sin efectos adicionales. El ausente no recupera el crédito.

**Capacidad y estados**

- Lugares ocupados = `confirmed + offered`.
- Una sesión cancelada o completada no acepta reservas.
- Reducir cupo por debajo de ocupados se rechaza.
- Aumentar cupo ejecuta `promoteIfAvailable` en la misma transacción.
- El worker marca `completed` cuando `starts_at + duration_minutes <= now`; a partir de ahí no se edita el cupo ni se aceptan reservas. La transición es idempotente.

### 7. Generación de sesiones y zona horaria

- Las plantillas guardan `weekday` ISO (1 = lunes, 7 = domingo), hora local y duración. La zona es siempre `America/Argentina/Buenos_Aires`, configurable con `APP_TIMEZONE`.
- La generación recorre el rango de fechas en la zona del estudio, construye el instante local y lo convierte a UTC con Luxon. No se usa un offset fijo `-03:00`: se usa la base IANA para resistir cambios de reglas.
- `INSERT ... ON CONFLICT (template_id, starts_at) DO NOTHING` da idempotencia. Las fechas anteriores a `now` se omiten. El rango máximo es 26 semanas.
- Las respuestas API incluyen ISO UTC; la UI formatea con `Intl.DateTimeFormat('es-AR', { timeZone })`. Los mensajes de WhatsApp formatean en la misma zona.
- No hay generación automática: la administradora elige el rango. Es una decisión de alcance para evitar un calendario perpetuo y clases no deseadas.

### 8. Autenticación y autorización

**Alumnas**

- Código de 6 dígitos generado con `crypto.randomInt`, hasheado con Argon2id. Nunca se guarda en claro.
- Solicitud: normalizar email, abrir transacción y tomar `pg_advisory_xact_lock(hashtext(email))` para serializar solicitudes del mismo contacto; contar tokens de la última hora (incluidos los señuelo) y rechazar la cuarta con 429. Insertar token con vencimiento a 10 minutos. Si existe alumna con email, enviar el código por `EmailSender`; si no, no enviar. La respuesta HTTP es siempre 202 con el mismo cuerpo.
- Solo el token más reciente no consumido es válido: solicitar un código nuevo invalida los anteriores, para evitar códigos viejos dando vueltas.
- Verificación: lock del token `FOR UPDATE`, comprobar vencimiento, incrementar intentos y comparar con Argon2. Al quinto fallo el token queda consumido/invalidado. Al acierto, consumirlo y crear `student_session` con token aleatorio de 32 bytes; se guarda SHA-256.
- Cookie `student_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` 90 días, `Secure` en producción. Logout revoca la sesión.
- Los códigos se envían por `EmailSender`: `LogEmailSender` por defecto imprime el código y no hace red; `SmtpEmailSender` es opcional para producción. El envío del código no usa la outbox de WhatsApp. En tests se inyecta un sender que captura el código para poder completar el flujo sin logs.
- Los intentos de solicitud también se limitan por IP a nivel HTTP (límite en memoria) además del límite por email en base.

**Staff**

- Email y contraseña con Argon2id. Cuentas creadas por CLI (`npm run staff:create`), sin auto-registro.
- Login genérico para email inexistente, contraseña incorrecta o cuenta inactiva. Sesión de 12 horas, mismo esquema de cookie y token hasheado.
- Rate limit por email/IP para frenar fuerza bruta.

**Autorización**

- Middleware `requireStudent` resuelve la alumna desde la cookie, nunca desde un ID de path.
- Las consultas de alumna siempre filtran por `student_id` de la sesión. Si se pide un recurso ajeno por ID, se responde 404 sin datos.
- Middleware `requireStaff` con roles. Las rutas de administración exigen `admin`; asistencia y cancelación de clase verifican además `session.instructor_id = staff.id` para instructoras.
- CSRF: `SameSite=Lax` + validación de `Origin` en métodos mutantes. CORS cerrado al origen de la app.

### 9. Outbox de WhatsApp

- Tabla `notifications` con `idempotency_key` único y payload como array ordenado de parámetros.
- Claves: `booking:<id>:confirmed`, `class:<sessionId>:cancelled:<studentId>`, `booking:<id>:spot_offered`.
- Plantillas versionadas en código: `booking_confirmed_v1`, `class_cancelled_v1`, `spot_offered_v1`. Un tipo tupla de TypeScript y un validador Zod exigen la cantidad exacta de parámetros; no hay parámetros libres.
- Al encolar se verifica el consentimiento. Sin consentimiento, la fila se inserta como `skipped` para dejar traza y el worker no la toma.
- Worker:
  1. Reclama hasta 20 filas con `UPDATE ... SET locked_until = now() + 60s, attempts = attempts + 1 WHERE id IN (SELECT id ... WHERE status = 'pending' AND next_attempt_at <= now() AND (locked_until IS NULL OR locked_until < now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20) RETURNING *`.
  2. Revalida consentimiento y renderiza.
  3. Llama al driver fuera de una transacción de base.
  4. Éxito: `sent`. Fallo: `pending` con backoff exponencial (1, 2, 4, 8, 16 minutos) hasta 5 intentos, luego `failed` con `last_error`. Si se omite por consentimiento retirado, se marca `skipped` y se reinicia `attempts` a 0.
  5. Si el worker muere, `locked_until` expira y otro worker puede reclamar. La entrega es at-least-once; la clave única evita filas duplicadas, no un reenvío excepcional tras un crash entre el envío y el marcado.
- Drivers: `LogWhatsAppDriver` (por defecto) registra destinatario, plantilla, mensaje renderizado y clave, y devuelve éxito; `MetaWhatsAppDriver` usa `fetch` contra Graph API con `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_ACCESS_TOKEN`, apuntando solo al número nuevo. El número actual no aparece en la configuración ni en el código.
- El worker también corre el vencimiento de ofertas, el vencimiento de paquetes y el cierre de sesiones cada 30–60 segundos. El barrido de paquetes toma filas con `expires_at <= now` y `balance > 0` con `FOR UPDATE SKIP LOCKED` e inserta el movimiento de vencimiento; el cierre de sesiones pasa a `completed` las que ya terminaron.

### 10. API y frontend

API REST bajo `/api`, JSON, errores `application/problem+json` con un código estable (`INSUFFICIENT_CREDITS`, `SESSION_FULL`, `OFFER_EXPIRED`, `DUPLICATE_BOOKING`, `FORBIDDEN`, etc.). Validación con Zod compartido entre API y formularios. Paginación simple por `limit`/`offset` en historial y reservas.

Rutas principales:

| Área | Rutas |
| --- | --- |
| Auth alumna | `POST /api/auth/student/request-code`, `POST /api/auth/student/verify-code`, `POST /api/auth/student/logout`, `GET /api/me` |
| Portal | `GET /api/me/packages`, `GET /api/me/movements`, `GET /api/sessions`, `GET /api/me/bookings`, `POST /api/sessions/:id/bookings`, `POST /api/bookings/:id/accept-offer`, `POST /api/bookings/:id/cancel` |
| Auth staff | `POST /api/staff/auth/login`, `POST /api/staff/auth/logout`, `GET /api/staff/me` |
| Staff alumnas | `GET/POST /api/staff/students`, `GET/PATCH /api/staff/students/:id`, `GET /api/staff/students/:id/packages`, `GET /api/staff/students/:id/movements` |
| Staff paquetes | `GET/POST /api/staff/plans`, `PATCH /api/staff/plans/:id`, `POST /api/staff/students/:id/packages`, `POST /api/staff/students/:id/adjustments` |
| Staff horarios | `GET/POST /api/staff/templates`, `PATCH /api/staff/templates/:id`, `POST /api/staff/templates/:id/generate`, `GET /api/staff/sessions`, `PATCH /api/staff/sessions/:id`, `POST /api/staff/sessions/:id/cancel` |
| Staff operación | `GET /api/staff/sessions/:id/roster`, `POST /api/staff/bookings/:id/attendance` |

Frontend:

- React 19 + Vite + React Router + TanStack Query + Tailwind. Dos shells: portal (`/`, `/ingresar`, `/clases`, `/mi-saldo`, `/mis-reservas`) y staff (`/staff/...`). El panel no se renderiza para alumnas y el portal no se renderiza para staff.
- Formularios con React Hook Form + Zod. Diálogos accesibles (Radix) para cancelar con la política visible. Countdown de oferta calculado con la hora del servidor y formateado en Buenos Aires.
- El panel de administración muestra saldos y permite ajustes con motivo; no hay campos de precio ni acciones de pago.
- No se usa SSR. La API sirve `apps/web/dist` en producción y Vite hace proxy en desarrollo.

### 11. Configuración

Validación de entorno con Zod al arrancar. Valores por defecto seguros para desarrollo:

| Variable | Default | Uso |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL |
| `APP_TIMEZONE` | `America/Argentina/Buenos_Aires` | Presentación y generación |
| `OFFER_WINDOW_MINUTES` | `120` | Plazo de oferta |
| `STUDENT_SESSION_DAYS` | `90` | Sesión de alumna |
| `AUTH_CODE_TTL_MINUTES` | `10` | Vencimiento del código |
| `AUTH_CODE_MAX_ATTEMPTS` | `5` | Intentos por código |
| `AUTH_CODE_REQUESTS_PER_HOUR` | `3` | Límite por contacto |
| `STAFF_SESSION_HOURS` | `12` | Sesión de staff |
| `WHATSAPP_DRIVER` | `log` | `log` o `meta` |
| `WHATSAPP_PHONE_NUMBER_ID` | — | Número nuevo, solo con driver `meta` |
| `WHATSAPP_ACCESS_TOKEN` | — | Token de Meta |
| `EMAIL_DRIVER` | `log` | `log` o `smtp` |
| `SMTP_URL` | — | Solo con driver `smtp` |
| `COOKIE_SECURE` | `false` | `true` en producción |
| `APP_ORIGIN` | `http://localhost:5173` | Validación de origen |
| `OUTBOX_MAX_ATTEMPTS` | `5` | Reintentos de aviso |
| `OUTBOX_POLL_MS` | `2000` | Frecuencia del worker |

`WHATSAPP_DRIVER=meta` sin credenciales falla al iniciar. `EMAIL_DRIVER=smtp` sin `SMTP_URL` también. El driver de log de email solo imprime el código fuera de producción; en producción se exige SMTP para no filtrar códigos en logs.

### 12. Estrategia de tests y arranque de PostgreSQL

La suite usa PostgreSQL real, no un mock ni una base embebida sin locks. `packages/testing` implementa:

1. Si `TEST_DATABASE_URL` está definida, usarla (CI con service container).
2. Si no, buscar `initdb` y `pg_ctl` en `PG_BIN` o en el `PATH`; crear un clúster temporal en el directorio de tmp, arrancarlo con socket Unix y `listen_addresses=''`, crear la base y aplicar migraciones.
3. Si no hay binarios, buscar una imagen local `postgres:16-alpine` en Podman o Docker y arrancar un contenedor efímero en un puerto aleatorio. No descarga imágenes: si no está, falla con instrucciones de aprovisionamiento.
4. Al terminar, detener el clúster/contenedor y borrar la base. `npm test` es el único comando; la base se crea desde cero en cada corrida.

Vitest corre los archivos en serie (`fileParallelism: false`) sobre una sola base; cada test limpia las tablas con `TRUNCATE ... RESTART IDENTITY CASCADE`. La prueba de 20 reservas usa `Promise.all` sobre `app.inject`, con un pool de 25 conexiones. El setup global reemplaza `globalThis.fetch` por una función que lanza si alguien intenta red; los drivers de log no la usan. No se llama a Meta, SMTP, WhatsApp ni a ningún servicio externo.

Matriz de aceptación:

| # | Criterio | Test | Comando |
| --- | --- | --- | --- |
| 1 | 20 reservas simultáneas sobre 12 lugares → 12 confirmadas, 8 en espera, cupo nunca excedido | `tests/acceptance/booking-concurrency.test.ts` | `npm test -- tests/acceptance/booking-concurrency.test.ts` |
| 2 | Cancelar con 5 h devuelve crédito y promueve; con 2 h no devuelve pero promueve | `tests/acceptance/booking-cancellation.test.ts` | `npm test -- tests/acceptance/booking-cancellation.test.ts` |
| 3 | Cancelar clase con 12 inscriptas → 12 devoluciones y 12 avisos pendientes, sin red | `tests/acceptance/class-cancellation.test.ts` | `npm test -- tests/acceptance/class-cancellation.test.ts` |
| 4 | Tras 100 operaciones aleatorias, la suma de movimientos coincide con el saldo | `tests/acceptance/ledger-invariant.test.ts` | `npm test -- tests/acceptance/ledger-invariant.test.ts` |
| 5 | Borrar un movimiento falla | `tests/acceptance/ledger-append-only.test.ts` | `npm test -- tests/acceptance/ledger-append-only.test.ts` |
| 6 | Una alumna no puede acceder a datos de otra | `tests/acceptance/student-isolation.test.ts` | `npm test -- tests/acceptance/student-isolation.test.ts` |
| 7 | Suite desde cero con un comando y sin red | `tests/acceptance/offline-suite.test.ts` + setup global | `npm test` |

Pruebas adicionales: transiciones de estado, rate limit de códigos, consentimiento, idempotencia de outbox, vencimiento de ofertas y paquetes, permisos de instructoras, generación de sesiones y formato de fechas. Los tests de API usan factories (`packages/testing/factories`) y sesiones creadas directamente, sin depender del envío real de códigos.

### 13. Migraciones, despliegue y operación

- Migraciones SQL versionadas en `packages/db/migrations`; `npm run db:migrate` las aplica. La migración inicial crea enums, tablas, índices parciales, triggers de saldo y append-only.
- `npm run staff:create -- --email ... --role admin` crea la primera cuenta; no hay contraseña por defecto.
- Build: `npm run build` compila API, worker y web. Producción: un proceso API (sirve la SPA), un proceso worker y PostgreSQL. Healthcheck `GET /health`.
- Rollback: las migraciones son forward-only; ante un despliegue fallido se vuelve a la imagen anterior y, si la migración ya cambió el esquema, se restaura el backup. Al ser un proyecto nuevo, no hay migración de datos existentes.
- Backups diarios con `pg_dump`; logs estructurados con Pino y sin tokens, códigos ni teléfonos completos.

## Risks / Trade-offs

- **Prerrequisito de PostgreSQL**: la suite necesita PostgreSQL 16 real. → El proyecto incluye `compose.yaml` con persistencia local para Podman/Docker; CI usa `TEST_DATABASE_URL`; el harness también puede levantar un clúster efímero si hay binarios. Si no hay ninguna opción, falla con un mensaje claro. La suite en sí no descarga nada.
- **Trigger que mantiene el saldo**: concentra lógica en SQL y puede sorprender a quien lea solo TypeScript. → El trigger es pequeño, está cubierto por el test de invariante y por los tests de concurrencia; toda escritura pasa por el ledger.
- **Bloqueo de la sesión**: serializa todas las reservas de una clase. Es correcto para 12 lugares y volumen bajo. → Transacciones cortas, sin red adentro, `lock_timeout` de 5 s y pool dimensionado.
- **Entrega at-least-once**: un crash entre el envío y el marcado puede duplicar un WhatsApp. → Clave de idempotencia y una sola fila por evento; se acepta el riesgo excepcional porque Meta no ofrece deduplicación transaccional. Para avisos de clase no es crítico.
- **Ventana de 24 h y plantillas de Meta**: la API de WhatsApp puede rechazar mensajes fuera de la ventana o sin plantilla aprobada. → El driver de log es el default; la configuración de Meta y la aprobación de plantillas son tareas operativas documentadas, no requisitos de la suite.
- **Devolución a un paquete vencido**: el crédito se devuelve pero queda inutilizable y el barrido lo vuelve a cero. Es la política elegida para no extender vigencias sin autorización. → La UI puede informarlo; la administradora puede compensar con un ajuste.
- **Sin idempotencia de compras y ajustes**: un doble clic de la administradora podría duplicar una compra. → La UI deshabilita el envío y la operación es transaccional; se puede agregar `Idempotency-Key` más adelante sin cambiar el modelo.
- **Email de códigos**: la entrega depende de un proveedor SMTP en producción; un fallo no se distingue en la respuesta (por diseño). → Reintento manual dentro del límite de 3 por hora y logs del driver.
- **Zona horaria**: Argentina no aplica DST hoy, pero las reglas pueden cambiar. → Se usa la base IANA, no un offset fijo, y los tests fijan la zona.
- **Fuente de sesiones manual**: si la administradora olvida generar el rango, no hay clases. → El panel muestra el rango generado y una tarea operativa semanal; no se agrega un cron de calendario perpetuo.

## Migration Plan

1. Provisionar PostgreSQL 16 con `podman compose up -d db` (o Docker) y crear la base de test sobre esa instancia o en un clúster efímero.
2. Aplicar la migración inicial (`npm run db:migrate`), que crea tablas, índices y triggers.
3. Crear la cuenta de administradora con `npm run staff:create`.
4. Cargar planes y plantillas iniciales desde el panel; generar las primeras sesiones.
5. Configurar `WHATSAPP_DRIVER=log` y `EMAIL_DRIVER=log` para la primera puesta en marcha; pasar a Meta/SMTP cuando el número nuevo y las plantillas estén aprobados.
6. Desplegar API y worker; verificar `/health`, una reserva de prueba, su movimiento de crédito y su notificación pendiente.
7. Rollback: restaurar la imagen anterior y el backup previo si la migración ya se aplicó. No hay datos heredados que migrar.

## Open Questions

- Qué proveedor SMTP y qué dominio remitente se usarán en producción. No cambia el puerto `EmailSender` ni las tareas.
- Cómo se aprueban y versionan las plantillas en la consola de Meta y qué política se adopta para la ventana de 24 h. No cambia el modelo de outbox ni la suite con driver de log.
- Retención de backups y frecuencia de restauración de prueba. Es una decisión operativa posterior al primer despliegue.
