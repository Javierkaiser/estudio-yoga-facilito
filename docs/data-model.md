# Modelo de datos

La migración inicial vive en `packages/db/migrations/0001_init.sql` y es la fuente de verdad del DDL. El espejo tipado para consultas futuras está en `packages/db/src/schema.ts`.

## Enums

| Término de negocio | Valor en base |
| --- | --- |
| Administradora / instructora | `admin` / `instructor` |
| Paquete activo / agotado / vencido | `active` / `exhausted` / `expired` |
| Compra / reserva / devolución / vencimiento / ajuste | `purchase` / `booking` / `refund` / `expiration` / `adjustment` |
| Estudiante / staff / sistema | `student` / `staff` / `system` |
| Sesión programada / cancelada / completada | `scheduled` / `cancelled` / `completed` |
| Reserva confirmada / en espera / ofrecida / asistió / ausente / cancelada / oferta vencida | `confirmed` / `waitlisted` / `offered` / `attended` / `absent` / `cancelled` / `offer_expired` |
| Aviso pendiente / enviado / fallido / omitido | `pending` / `sent` / `failed` / `skipped` |

## Tablas

### `students`

Estudiante del estudio.

| Columna | Tipo | Regla |
| --- | --- | --- |
| `id` | uuid | PK, `gen_random_uuid()` |
| `name` | text | obligatorio |
| `phone_e164` | text | obligatorio, único |
| `email` | text | opcional, único por `lower(email)` |
| `whatsapp_consent_at` | timestamptz | nulo si no dio consentimiento |
| `created_at`, `updated_at` | timestamptz | defaults |

### `staff_users`

Cuentas de administración e instructoras. No hay auto-registro.

| Columna | Tipo | Regla |
| --- | --- | --- |
| `email` | text | único por `lower(email)` |
| `password_hash` | text | Argon2id, nunca texto plano |
| `role` | `staff_role` | `admin` o `instructor` |
| `active` | boolean | una cuenta inactiva no puede autenticarse |

### `package_plans`

| Columna | Tipo | Regla |
| --- | --- | --- |
| `credits` | integer | `> 0` |
| `validity_days` | integer | `> 0` o `NULL` (no vence) |
| `active` | boolean | los planes inactivos no se asignan |

La vigencia por defecto de 90 días se aplica en el servicio al crear el plan; la base acepta `NULL` explícito.

### `student_packages`

| Columna | Tipo | Regla |
| --- | --- | --- |
| `student_id` | uuid | FK a `students` |
| `plan_id` | uuid | FK a `package_plans` |
| `credits_purchased` | integer | `> 0` |
| `balance` | integer | `>= 0`, mantenido por el trigger de movimientos |
| `purchased_at` | timestamptz | fecha de compra |
| `expires_at` | timestamptz | nulo si el plan no vence |
| `status` | `package_status` | activo, agotado o vencido |

### `credit_movements`

Historial append-only. No existe ningún camino de aplicación para modificarlo o borrarlo.

| Columna | Tipo | Regla |
| --- | --- | --- |
| `seq` | bigserial | orden estable de auditoría |
| `student_package_id` | uuid | paquete afectado |
| `student_id` | uuid | se completa desde el paquete en el trigger |
| `type` | `movement_type` | compra, reserva, devolución, vencimiento o ajuste |
| `delta` | integer | distinto de cero, firmado |
| `balance_after` | integer | lo calcula el trigger |
| `booking_id`, `class_session_id` | uuid | contexto cuando corresponde |
| `actor_type`, `actor_id` | enum/uuid | quién produjo el movimiento |
| `reason` | text | obligatorio para ajustes |

Índices relevantes:

- `credit_movements_package_idx (student_package_id, seq)`.
- `credit_movements_student_idx (student_id, seq DESC)`.
- `credit_movements_booking_type_uidx (booking_id, type)` parcial para `booking` y `refund`: una reserva tiene como máximo un débito y una devolución.

### `class_templates` y `class_sessions`

- La plantilla guarda día ISO (1–7), hora local, duración, cupo e instructora.
- La sesión guarda `starts_at` en UTC, duración, cupo e instructora como snapshot.
- `class_sessions_template_start_uidx` evita duplicar una sesión generada.
- Una sesión cancelada o completada no admite reservas.

### `bookings`

| Columna | Tipo | Regla |
| --- | --- | --- |
| `session_id`, `student_id` | uuid | FKs |
| `status` | `booking_status` | estados del ciclo de reserva |
| `offer_expires_at` | timestamptz | solo para ofertas |
| `attended_at` | timestamptz | marcación de asistencia |
| `cancelled_at`, `cancelled_by_type`, `cancelled_by_id` | varios | auditoría de cancelación |

`bookings_active_student_session_uidx` es único parcial sobre `(session_id, student_id)` para los estados activos (`confirmed`, `waitlisted`, `offered`, `attended`, `absent`). `cancelled` y `offer_expired` liberan la combinación.

### `notifications`, `auth_tokens`, `student_sessions`, `staff_sessions`

Tablas creadas para las capacidades de avisos y autenticación. En esta etapa solo se usa el esquema; la lógica llega en los grupos 4 y 7.

- `notifications`: outbox con `idempotency_key` único, estado, intentos y bloqueo.
- `auth_tokens`: hash del código, vencimiento, intentos y consumo.
- `student_sessions` y `staff_sessions`: tokens hasheados, vencimiento y revocación.

## Invariantes defendidas por la base

1. `student_packages.balance >= 0`.
2. Insertar un movimiento actualiza el saldo del paquete y completa `balance_after` en la misma sentencia; si el saldo quedaría negativo, la transacción aborta.
3. `UPDATE` y `DELETE` sobre `credit_movements` lanzan `credit_movements_append_only`.
4. El `student_id` del movimiento se toma del paquete, no de la entrada del llamador.
5. Un estudiante no puede tener dos reservas activas en la misma sesión.
6. Una reserva no puede tener dos débitos ni dos devoluciones.
7. Un teléfono E.164 y un email normalizado no se repiten.
8. El estado del paquete se recalcula al mover créditos: activo, agotado o vencido.

## Sin dinero

No existen columnas de precio, importe, pago, factura ni moneda. Los planes solo tienen créditos y vigencia.

## Comandos

```bash
npm run db:migrate
```

El runner registra cada archivo en `schema_migrations`; una segunda ejecución no aplica nada.
