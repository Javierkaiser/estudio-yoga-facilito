# Ledger de créditos

El ledger es la única fuente de verdad del saldo. La implementación está en `packages/core/src/ledger.ts` y la defensa de base en `packages/db/migrations/0001_init.sql`.

## Regla central

El saldo de un paquete es la suma de los deltas de sus movimientos. La columna `student_packages.balance` es una caché mantenida por un trigger `BEFORE INSERT` sobre `credit_movements`:

1. Suma el delta al saldo del paquete con un `UPDATE` atómico.
2. Rechaza la operación si el saldo quedaría negativo.
3. Completa `balance_after` con el saldo resultante.
4. Ajusta el estado a `active`, `exhausted` o `expired`.

La aplicación nunca hace `UPDATE student_packages SET balance = ...`. Solo inserta movimientos.

## Append-only

`credit_movements` tiene un trigger `BEFORE UPDATE OR DELETE` que lanza `credit_movements_append_only`. El test `tests/acceptance/ledger-append-only.test.ts` intenta borrar y editar un movimiento y verifica que el saldo no cambie.

## Único escritor

Solo `packages/core/src/ledger.ts` importa las tablas `student_packages` y `credit_movements`. El test `tests/architecture/ledger-writer.test.ts` recorre `packages/core/src` y `apps` y falla si otro módulo las toca. Los servicios de reservas y horarios deben llamar a las funciones del ledger.

## Tipos de movimiento

| Tipo | Cuándo | Delta |
| --- | --- | --- |
| `purchase` | Alta de un paquete | `+credits` |
| `booking` | Confirmación de una reserva | `-1` |
| `refund` | Devolución por cancelación | `+1` |
| `expiration` | Vencimiento de un paquete | `-balance` restante |
| `adjustment` | Corrección administrativa | Firmado, con motivo |

Todos registran paquete, estudiante, actor, motivo cuando corresponde y contexto de reserva o clase si existe.

## Compra

`purchasePackage` crea el paquete con saldo 0 y luego inserta el movimiento `purchase +credits` en la misma transacción. Si el movimiento falla, el paquete no queda creado. La vigencia se calcula desde `purchased_at`; `validity_days = NULL` significa que no vence.

## Orden de consumo (FEFO)

Al debitar se elige el primer paquete activo con saldo cuyo vencimiento sea más próximo:

```sql
ORDER BY expires_at ASC NULLS LAST, purchased_at ASC, id ASC
LIMIT 1
FOR UPDATE
```

Los paquetes vencidos o agotados se saltean. Los paquetes sin vencimiento van después de los que vencen. El `FOR UPDATE` serializa dos débitos concurrentes sobre el mismo paquete: si queda un solo crédito, uno confirma y el otro recibe `INSUFFICIENT_CREDITS`.

## Devolución

La devolución se registra en el paquete que financió la reserva, no en el paquete más nuevo. Es idempotente: si ya existe un movimiento `refund` para esa reserva, se devuelve el existente y no se inserta otro. El índice único parcial `(booking_id, type)` es la última defensa.

Si el paquete de origen ya venció, el crédito se devuelve igual y queda sujeto a la vigencia original. El siguiente barrido de vencimientos lo vuelve a cero; no se extiende la fecha.

## Vencimiento

`expireDuePackages` busca paquetes con `expires_at <= now` y:

- Si tienen saldo, inserta `expiration -balance` y el trigger marca `expired`.
- Si no tienen saldo, solo actualiza el estado a `expired`.
- Los paquetes con `expires_at = NULL` nunca se tocan.

El barrido incluye paquetes ya marcados como vencidos que hayan recibido una devolución posterior, para que el crédito devuelto a un paquete vencido no quede utilizable.

## Ajustes

Solo una administradora activa puede ajustar. El motivo es obligatorio. El delta no puede ser cero y el trigger rechaza cualquier resultado negativo. Un ajuste positivo sobre un paquete vencido se registra, pero el estado sigue siendo `expired`; no se extiende la vigencia.

## Actores

- `student`: reserva o cancelación iniciada por el estudiante.
- `staff`: compra, ajuste o cancelación de clase.
- `system`: vencimiento o devolución automática.

## Tests

```bash
npm test -- tests/ledger
npm test -- tests/acceptance/ledger-invariant.test.ts
npm test -- tests/acceptance/ledger-append-only.test.ts
npm test -- tests/db/triggers.test.ts
```

El test de invariante ejecuta 100 operaciones deterministas y verifica, por paquete, que la suma de deltas coincida con el saldo y que cada `balance_after` sea el acumulado hasta ese movimiento.
