# Proposal

## Why

Andrea controla los paquetes de 10 clases con tarjetas de papel: las alumnas las pierden, se discute cuántas clases quedan y no hay forma de auditar el saldo. Las clases de la tarde tienen cupo de 12, se llenan sin lista de espera y, cuando una instructora se enferma, avisar a las inscriptas es un caos manual.

Hace falta un único sistema que sea la fuente de verdad del saldo, impida la sobreventa, ordene la espera y avise por WhatsApp sin depender de que alguien se acuerde.

## What Changes

- **Saldo auditable por alumna**: paquetes con créditos, vencimiento y saldo; movimientos append-only (compra, reserva, devolución, vencimiento, ajuste) con saldo resultante, actor y motivo. El saldo nunca se edita: se deriva de los movimientos.
- **Cupo y reservas transaccionales**: sesiones con cupo e instructora, descuento de un crédito en la misma transacción de la reserva, lock pesimista sobre la sesión, índice único parcial por alumna/sesión y lista de espera FIFO sin sobreventa.
- **Lista de espera con ofertas**: al liberarse un lugar se ofrece al primero de la cola con plazo configurable de 2 h; si no acepta o no tiene saldo, pasa al siguiente.
- **Cancelaciones con política**: la alumna cancela con 4 h o más y recupera el crédito; con menos, no lo recupera. En ambos casos se libera el lugar y se promueve la espera. La cancelación de una clase por la instructora devuelve el crédito a todas las inscriptas y las avisa.
- **Portal de la alumna sin contraseña**: acceso con código de 6 dígitos por email, hasheado, de 10 minutos, 5 intentos, 3 solicitudes por hora, un solo uso y sesión de 90 días. Respuesta idéntica exista o no el contacto.
- **Panel del staff con roles**: administradora gestiona alumnas, planes, paquetes, ajustes, horarios, sesiones y cancelaciones; las instructoras marcan asistencia y cancelan sus propias clases.
- **Avisos por outbox**: notificaciones de reserva confirmada, clase cancelada y lugar liberado; plantillas con parámetros en orden fijo, clave de idempotencia, reintentos y driver de log por defecto. Ninguna llamada HTTP dentro del request.
- **Fechas consistentes**: almacenamiento en UTC y presentación en `America/Argentina/Buenos_Aires`.
- **Suite de aceptación reproducible**: cada criterio del pedido queda cubierto por un test automatizado, con un único comando que levanta PostgreSQL efímero y corre sin red.

Fuera de alcance: videos, rutinas, tienda, pagos, precios, facturación, app nativa, multi-sede, multi-idioma y chat.

## Capabilities

### New Capabilities

- `credit-ledger`: paquetes de créditos, saldo derivado, movimientos append-only, vencimientos, ajustes auditados y orden de consumo.
- `class-scheduling`: plantillas semanales, generación de sesiones en UTC, cupo, instructoras y cancelación de clases.
- `booking-lifecycle`: reservas con débito transaccional, control de cupo bajo concurrencia, lista de espera FIFO, ofertas con plazo, cancelaciones y asistencia.
- `student-auth`: acceso passwordless de alumnas, códigos hasheados, rate limiting, sesiones y aislamiento de datos.
- `student-portal`: autoservicio de la alumna para consultar saldo e historial, reservar, anotarse en espera, aceptar ofertas y cancelar.
- `staff-console`: autenticación y autorización del staff, gestión administrativa y operación de instructoras.
- `whatsapp-notifications`: outbox de avisos, plantillas, idempotencia, consentimiento, reintentos y driver de log/Meta.

### Modified Capabilities

Ninguna: el proyecto no tiene specs previas.

## Impact

- **Nuevo monorepo TypeScript con npm workspaces**: API Fastify + PostgreSQL + Drizzle ORM, SPA React para portal y panel, worker de outbox y vencimientos, paquete compartido de contratos y utilidades de fecha.
- **Base de datos nueva**: `students`, `package_plans`, `student_packages`, `credit_movements`, `class_templates`, `class_sessions`, `bookings`, `notifications`, `auth_tokens`, más `staff_users` y sesiones de autenticación.
- **Configuración**: `DATABASE_URL`, zona horaria, ventana de oferta, TTL y límites del código, drivers de WhatsApp/email, credenciales del número nuevo de WhatsApp. El número actual del estudio no se toca.
- **Dependencias**: PostgreSQL 16, Node.js 22 y npm workspaces. En modo por defecto no se requiere ninguna credencial de Meta ni servicio de email externo.
- **Sin dinero**: no se modelan precios, pagos ni facturación.
- **Tests**: Vitest sobre PostgreSQL real efímero; sin Playwright ni red en la suite de aceptación.
