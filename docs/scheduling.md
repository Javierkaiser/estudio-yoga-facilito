# Horarios, sesiones y cancelación de clase

Este documento describe el grupo 5 de `gestion-estudio-yoga`: plantillas semanales, generación
idempotente de sesiones, edición de cupo e instructora, fechas en UTC y cancelación de una clase
con devolución de créditos y avisos en cola.

## Modelo

- `class_templates` define la semana fija: día ISO (1 = lunes, 7 = domingo), hora local,
  duración, cupo e instructora.
- `class_sessions` son las clases concretas. Guardan una copia del cupo y la instructora vigentes
  al generarse. Cambiar la plantilla después no modifica las sesiones ya creadas.
- Los estados de una sesión son `scheduled`, `cancelled` y `completed`.

La API de desarrollo vive en `apps/api/src/dev-scheduling.ts` y el dominio en
`packages/core/src/scheduling.ts`.

## Zona horaria

Todo se almacena en UTC. La conversión de hora local a UTC usa Luxon y la zona
`America/Argentina/Buenos_Aires` (`packages/shared/src/time.ts`). La interfaz y los mensajes
formatean el instante en esa misma zona.

Ejemplos:

| Hora local del estudio | Instante almacenado        |
| ---------------------- | -------------------------- |
| 2026-11-03 18:00       | `2026-11-03T21:00:00.000Z` |
| 2026-11-04 23:30       | `2026-11-05T02:30:00.000Z` |

Las comparaciones de negocio (sesión futura, sesión comenzada, vencimiento de ofertas) se hacen
sobre el instante UTC, nunca sobre la hora local.

## Plantillas

Validaciones al crear o editar:

- Día entero entre 1 y 7.
- Hora con formato `HH:mm`.
- Duración entera mayor a 0.
- Cupo entero mayor a 0.
- Instructora existente, activa y con rol `instructor`.

Solo una administradora activa puede crear o editar plantillas. Una plantilla inactiva no permite
generar sesiones nuevas.

## Generación de sesiones

La generación recibe una plantilla y un rango de fechas locales (`YYYY-MM-DD`). Para cada fecha del
rango cuyo día ISO coincide con la plantilla:

1. Convierte la hora local a UTC.
2. Omite la fecha si el instante ya pasó.
3. Inserta la sesión con el cupo y la instructora de la plantilla.
4. Si ya existe una sesión para esa plantilla y ese instante, no la modifica.

La idempotencia se apoya en el índice único parcial
`class_sessions_template_start_uidx (template_id, starts_at) WHERE template_id IS NOT NULL` y en
`ON CONFLICT ... DO NOTHING`. Regenerar el mismo rango devuelve `created: 0` y las sesiones
existentes se conservan.

El rango máximo es de 26 semanas (182 días). El resultado informa cuántas sesiones se crearon y
cuántas se omitieron, incluyendo las fechas pasadas.

## Edición de sesiones

Una administradora puede cambiar el cupo o la instructora de una sesión `scheduled` que no haya
comenzado.

- El cupo debe ser un entero positivo.
- No puede ser menor que las reservas `confirmed` más las `offered`.
- Si la sesión ya comenzó, la operación se rechaza con `SESSION_STARTED`.
- Si el cupo aumenta y hay lista de espera, se promueve a la primera persona elegible en orden
  FIFO que tenga un crédito vigente. La reserva pasa a `offered` y se encola el aviso
  `spot_offered`.
- La oferta vence a los 120 minutos o al inicio de la clase, lo que ocurra primero.

La promoción asume que la fila de `class_sessions` ya está bloqueada por el llamador. El servicio
de reservas completo (grupo 6) reutiliza esta primitiva en lugar de duplicar el conteo de cupo.

## Cancelación de clase

Puede cancelar la instructora asignada o una administradora. Solo aplica a sesiones `scheduled`
futuras; una sesión ya comenzada se rechaza.

Dentro de una única transacción:

1. La sesión pasa a `cancelled` con `cancelled_at`, `cancelled_by_type = 'staff'` y el id de
   quien cancela.
2. Cada reserva `confirmed` recibe una devolución de un crédito al paquete de origen mediante el
   ledger.
3. Cada reserva `offered` o `waitlisted` se cancela sin devolución, porque nunca se debitó.
4. Cada reserva activa pasa a `cancelled`.
5. Se encola un aviso `class_cancelled` por persona afectada. Si no hay consentimiento de
   WhatsApp, la fila queda en estado `skipped`; si hay consentimiento, queda `pending`.
6. No se hace ninguna llamada de red durante el request.

La operación es idempotente: si la sesión ya está cancelada, devuelve
`alreadyCancelled: true` sin generar devoluciones ni avisos nuevos.

Con 12 reservas confirmadas, el resultado es 12 devoluciones y 12 avisos pendientes. El test de
aceptación `tests/acceptance/class-cancellation.test.ts` lo verifica contra PostgreSQL real.

## Disponibilidad

El listado de sesiones expone:

- Fecha y hora local.
- Instructora.
- Cupo total.
- Ocupados: reservas `confirmed` más `offered`.
- Disponibles: `max(0, capacity - ocupados)`.
- En espera: reservas `waitlisted`.

Una sesión llena se muestra con 0 disponibles aunque tenga lista de espera. La lista de espera no
ocupa cupo.

## Cierre de sesiones

`completeSessions` pasa a `completed` las sesiones `scheduled` cuya duración ya terminó. Es
idempotente: una segunda ejecución no devuelve filas. Una sesión completada no admite cambios de
cupo ni nuevas reservas.

## API de desarrollo

Todas las rutas se registran solo cuando `NODE_ENV !== 'production'` y no tienen autenticación.

| Método  | Ruta                                         | Uso                                                           |
| ------- | -------------------------------------------- | ------------------------------------------------------------- |
| `GET`   | `/api/dev/scheduling/overview`               | Plantillas, instructoras y sesiones de las próximas 8 semanas |
| `POST`  | `/api/dev/scheduling/demo-instructors`       | Crea Ana y Lucía como instructoras de demo                    |
| `POST`  | `/api/dev/scheduling/templates`              | Alta de plantilla                                             |
| `PATCH` | `/api/dev/scheduling/templates/:id`          | Edición de plantilla                                          |
| `POST`  | `/api/dev/scheduling/templates/:id/generate` | Generación por rango                                          |
| `PATCH` | `/api/dev/scheduling/sessions/:id`           | Edición de cupo o instructora                                 |
| `POST`  | `/api/dev/scheduling/sessions/:id/cancel`    | Cancelación con devoluciones y avisos                         |

En la consola visual, la pestaña **Clases** permite crear plantillas, generar sesiones, editar el
cupo y cancelar una clase. Los avisos quedan en la tabla `notifications`; el worker que los envía
todavía no está implementado.

## Verificación

```bash
npm test -- tests/scheduling/templates.test.ts
npm test -- tests/scheduling/generation.test.ts
npm test -- tests/scheduling/session-edit.test.ts
npm test -- tests/shared/timezone.test.ts
npm test -- tests/acceptance/class-cancellation.test.ts
```

## Fuera de alcance por ahora

- Reserva confirmada, lista de espera completa, aceptación y vencimiento de ofertas (grupo 6).
- Worker de outbox y envío real de WhatsApp.
- Autenticación y permisos del panel de staff (grupo 7).

La primitiva `promoteWaitlist` de `packages/core/src/bookings.ts` existe solo para cubrir el
aumento de cupo de este grupo. El resto del ciclo de reservas se implementa en el grupo 6.
