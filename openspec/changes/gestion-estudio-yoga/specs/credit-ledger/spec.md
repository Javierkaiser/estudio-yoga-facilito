# Spec Delta

## Purpose

Registra los paquetes de créditos de cada alumna y un historial append-only que determina el saldo, permite auditar cada débito, devolución, vencimiento y ajuste, e impide que el saldo se modifique por fuera de los movimientos.

## ADDED Requirements

### Requirement: Saldo derivado de los movimientos

El saldo de cada paquete DEBE ser la suma de los deltas de sus movimientos. Toda lectura de saldo y toda decisión de consumo DEBEN basarse en esa suma, y el sistema MUST rechazar cualquier operación que intente dejar el saldo negativo.

#### Scenario: Compra de un paquete

- **WHEN** la administradora registra la compra de un plan de 10 créditos para una alumna
- **THEN** se inserta un movimiento de compra con delta +10 y saldo resultante 10
- **AND** el saldo del paquete queda en 10

#### Scenario: Reserva que consume un crédito

- **WHEN** una alumna con saldo 10 confirma una reserva
- **THEN** se inserta un movimiento de reserva con delta -1 y saldo resultante 9
- **AND** el saldo del paquete queda en 9

#### Scenario: Devolución de un crédito

- **WHEN** se cancela una reserva alcanzada por la política de devolución
- **THEN** se inserta un movimiento de devolución con delta +1 en el paquete que financió la reserva
- **AND** el saldo resultante aumenta en 1

#### Scenario: Saldo insuficiente

- **WHEN** una alumna con saldo 0 intenta confirmar una reserva
- **THEN** la reserva es rechazada
- **AND** no se inserta ningún movimiento
- **AND** el saldo permanece en 0

#### Scenario: Invariante después de operaciones aleatorias

- **WHEN** se ejecutan 100 operaciones aleatorias de compra, reserva, devolución, vencimiento y ajuste sobre varios paquetes
- **THEN** para cada paquete la suma de los deltas coincide exactamente con su saldo
- **AND** cada movimiento registra un saldo resultante igual al saldo acumulado hasta ese movimiento

### Requirement: Historial append-only

El historial de movimientos DEBE ser append-only. Cualquier intento de actualizar o eliminar un movimiento MUST fallar y MUST NOT alterar el historial ni el saldo.

#### Scenario: Intento de borrar un movimiento

- **WHEN** se intenta ejecutar un DELETE sobre un movimiento de crédito
- **THEN** la base de datos rechaza la operación
- **AND** el movimiento sigue existiendo
- **AND** el saldo no cambia

#### Scenario: Intento de editar un movimiento

- **WHEN** se intenta modificar el delta o el saldo resultante de un movimiento
- **THEN** la base de datos rechaza la operación
- **AND** el movimiento conserva sus valores originales

#### Scenario: Sin endpoints de edición o borrado

- **WHEN** un cliente del portal o del panel intenta editar o borrar un movimiento por la API
- **THEN** la API responde que la operación no está permitida
- **AND** no existe ninguna ruta que la ejecute

### Requirement: Único servicio escritor de créditos

Solo el servicio de créditos DEBE insertar movimientos y actualizar saldos. Los controladores HTTP, los componentes de UI y cualquier otro módulo MUST NOT escribir directamente sobre las tablas de créditos.

#### Scenario: Controlador sin escritura directa

- **WHEN** se ejecuta la suite de verificación de arquitectura
- **THEN** ningún controlador ni módulo de UI contiene escrituras a paquetes, saldos o movimientos
- **AND** todas las mutaciones de créditos pasan por el servicio de créditos

### Requirement: Auditoría de cada movimiento

Todo movimiento DEBE registrar tipo, delta firmado, saldo resultante, paquete, reserva y clase cuando correspondan, actor y motivo. Los ajustes MUST exigir un motivo no vacío y un actor administrador.

#### Scenario: Ajuste con motivo

- **WHEN** la administradora ajusta el saldo de una alumna en -2 con el motivo "corrección de carga"
- **THEN** se inserta un movimiento de ajuste con delta -2, actor administrador y motivo registrado

#### Scenario: Ajuste sin motivo

- **WHEN** la administradora intenta un ajuste sin indicar motivo
- **THEN** la operación es rechazada
- **AND** no se inserta ningún movimiento

#### Scenario: Tipos de movimiento válidos

- **WHEN** se registra un movimiento
- **THEN** su tipo es uno de compra, reserva, devolución, vencimiento o ajuste
- **AND** cualquier otro tipo es rechazado

### Requirement: Vencimiento de paquetes

Un paquete con vigencia DEBE vencer al cumplirse los días configurados desde su compra. Al vencer, los créditos no usados MUST registrarse como un movimiento de vencimiento que lleve el saldo a 0. Un paquete sin vigencia MUST NOT vencer automáticamente.

#### Scenario: Vencimiento con saldo pendiente

- **WHEN** un paquete de vigencia 90 días llega a su fecha de vencimiento con saldo 3
- **THEN** se inserta un movimiento de vencimiento con delta -3 y saldo resultante 0

#### Scenario: Vencimiento sin saldo pendiente

- **WHEN** un paquete llega a su vencimiento con saldo 0
- **THEN** no se inserta ningún movimiento de vencimiento

#### Scenario: Paquete sin vencimiento

- **WHEN** un paquete fue creado con vigencia nula
- **THEN** nunca se le aplica un vencimiento automático

#### Scenario: Paquete vencido no se consume

- **WHEN** una alumna solo tiene paquetes vencidos e intenta reservar
- **THEN** la reserva es rechazada por falta de saldo vigente

### Requirement: Orden de consumo de créditos

Al confirmar una reserva, el sistema DEBE consumir primero el paquete activo con vencimiento más próximo. Los paquetes sin vencimiento MUST consumirse después de los que vencen, y los empates MUST resolverse por la compra más antigua.

#### Scenario: Dos paquetes con distinto vencimiento

- **WHEN** una alumna tiene un paquete con saldo que vence en 10 días y otro que vence en 60 días
- **THEN** la reserva descuenta del paquete que vence en 10 días

#### Scenario: Paquete sin vencimiento

- **WHEN** una alumna tiene un paquete con vencimiento y otro sin vencimiento, ambos con saldo
- **THEN** la reserva descuenta primero del paquete con vencimiento

#### Scenario: Paquete agotado o vencido

- **WHEN** el paquete con vencimiento más próximo está agotado o vencido
- **THEN** el consumo pasa al siguiente paquete activo con saldo

### Requirement: Devolución al paquete de origen

La devolución de un crédito DEBE registrarse una sola vez en el paquete que financió la reserva. Si ese paquete ya venció, el crédito MUST devolverse igual y MUST quedar sujeto a la vigencia original, sin extenderla.

#### Scenario: Devolución en el paquete usado

- **WHEN** una reserva financiada por el paquete A se cancela con derecho a devolución
- **THEN** se inserta un movimiento de devolución +1 en el paquete A
- **AND** no se modifica ningún otro paquete

#### Scenario: Devolución duplicada

- **WHEN** se procesa dos veces la cancelación de la misma reserva
- **THEN** se registra una sola devolución
- **AND** el saldo aumenta una sola vez

#### Scenario: Devolución de un paquete vencido

- **WHEN** la reserva fue financiada por un paquete que ya venció
- **THEN** la devolución se registra en ese paquete
- **AND** su fecha de vencimiento no se extiende

### Requirement: Concurrencia de débitos sobre un paquete

Dos operaciones concurrentes que consuman del mismo paquete MUST serializarse. Si solo queda un crédito, exactamente una DEBE confirmar y la otra MUST ser rechazada, sin saldo negativo ni movimientos inconsistentes.

#### Scenario: Dos reservas simultáneas con un crédito

- **WHEN** dos reservas simultáneas de la misma alumna compiten por el único crédito de un paquete
- **THEN** una reserva se confirma y la otra se rechaza por saldo insuficiente
- **AND** el saldo final es 0
- **AND** la suma de movimientos coincide con el saldo

### Requirement: Estado del paquete coherente con su saldo

El estado de un paquete DEBE derivarse de su saldo y su vencimiento: activo si tiene saldo y no venció, agotado si tiene saldo 0, vencido si pasó su fecha de vencimiento. Ninguna operación MUST permitir un estado contradictorio.

#### Scenario: Paquete agotado

- **WHEN** el último crédito de un paquete se consume en una reserva
- **THEN** el paquete queda con saldo 0 y estado agotado

#### Scenario: Paquete vencido

- **WHEN** un paquete supera su fecha de vencimiento
- **THEN** su estado es vencido
- **AND** no puede financiar nuevas reservas
