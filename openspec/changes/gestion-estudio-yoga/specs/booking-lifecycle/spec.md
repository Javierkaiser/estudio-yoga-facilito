# Spec Delta

## Purpose

Garantiza que cada reserva consuma un crédito, que el cupo nunca se exceda aunque haya reservas simultáneas, que la lista de espera sea FIFO y que cada lugar liberado se ofrezca con un plazo antes de pasar al siguiente.

## ADDED Requirements

### Requirement: Reserva confirmada con débito en la misma transacción

Cuando una sesión tiene lugares disponibles, el sistema DEBE confirmar la reserva y descontar exactamente un crédito en la misma transacción. Si cualquiera de las dos operaciones falla, ninguna MUST persistir.

#### Scenario: Reserva exitosa

- **WHEN** una alumna con saldo reserva una sesión futura con lugares disponibles
- **THEN** la reserva queda confirmada
- **AND** se descuenta un crédito del paquete elegido
- **AND** ambos cambios son visibles juntos

#### Scenario: Fallo al descontar el crédito

- **WHEN** la alumna no tiene saldo vigente al confirmar la reserva
- **THEN** la reserva no se crea
- **AND** no se inserta ningún movimiento de crédito
- **AND** el lugar sigue disponible

#### Scenario: Reserva sobre sesión no disponible

- **WHEN** una alumna intenta reservar una sesión cancelada, completada o ya comenzada
- **THEN** la operación es rechazada
- **AND** no se descuenta ningún crédito

### Requirement: Cupo sin sobreventa bajo concurrencia

El control de cupo DEBE ser atómico por sesión. Aunque lleguen reservas simultáneas, la cantidad de reservas confirmadas más ofrecidas MUST NOT superar el cupo, y ninguna reserva MUST confirmarse con un cupo calculado fuera de la transacción.

#### Scenario: Veinte reservas simultáneas para doce lugares

- **WHEN** 20 alumnas distintas con saldo reservan al mismo tiempo una sesión de cupo 12
- **THEN** exactamente 12 reservas quedan confirmadas
- **AND** exactamente 8 quedan en lista de espera
- **AND** en ningún momento el cupo supera 12
- **AND** el saldo de cada alumna confirmada baja exactamente un crédito

#### Scenario: Sesión llena

- **WHEN** una sesión alcanza su cupo
- **THEN** ninguna reserva adicional se confirma
- **AND** toda reserva adicional con lugar en la espera queda en lista de espera

### Requirement: Una reserva activa por alumna y sesión

Una alumna DEBE tener como máximo una reserva activa por sesión. Los estados confirmada, en espera, ofrecida, asistió y ausente MUST contar como activos; cancelada y oferta vencida MUST NOT bloquear una nueva reserva.

#### Scenario: Segunda reserva activa

- **WHEN** una alumna con una reserva confirmada intenta reservar otra vez la misma sesión
- **THEN** la segunda operación es rechazada
- **AND** no se descuenta un segundo crédito

#### Scenario: Reserva después de cancelar

- **WHEN** una alumna cancela su reserva y luego vuelve a reservar la misma sesión
- **THEN** la nueva reserva es aceptada si hay lugar o pasa a lista de espera si está llena

#### Scenario: Reserva simultánea duplicada

- **WHEN** la misma alumna envía dos reservas simultáneas para la misma sesión
- **THEN** se persiste una sola reserva activa
- **AND** se descuenta como máximo un crédito

### Requirement: Lista de espera FIFO

Cuando una sesión está llena, la reserva DEBE quedar en lista de espera sin descontar crédito. El orden de la espera MUST ser FIFO por momento de alta, con desempate estable, y la posición MUST ser visible para la alumna y el staff.

#### Scenario: Ocho alumnas en espera

- **WHEN** 20 alumnas reservan una sesión de cupo 12
- **THEN** las 8 excedentes quedan en espera en el orden en que llegaron
- **AND** la primera de la cola ocupa la posición 1
- **AND** ninguna pierde crédito por estar en espera

#### Scenario: Alta en espera sin saldo

- **WHEN** una alumna sin saldo intenta reservar una sesión llena
- **THEN** puede quedar en lista de espera
- **AND** no se descuenta crédito

### Requirement: Oferta de lugar liberado

Cuando se libera un lugar en una sesión llena, el sistema DEBE ofrecerlo al primero de la cola que tenga saldo vigente. La oferta MUST reservar el lugar, MUST tener un vencimiento configurable de 120 minutos por defecto y MUST encolar el aviso de lugar liberado. Una alumna sin saldo MUST ser salteada sin perder su posición.

#### Scenario: Lugar liberado con espera

- **WHEN** se cancela una reserva confirmada de una sesión llena con lista de espera
- **THEN** la primera alumna elegible de la cola pasa a estado ofrecida
- **AND** la oferta vence 120 minutos después
- **AND** el lugar no se ofrece a una segunda alumna mientras la oferta esté vigente

#### Scenario: Primera de la cola sin saldo

- **WHEN** la primera alumna de la cola no tiene saldo vigente al liberarse un lugar
- **THEN** se ofrece el lugar a la siguiente alumna elegible
- **AND** la primera conserva su posición en la espera

#### Scenario: Sin alumnas elegibles

- **WHEN** se libera un lugar y ninguna alumna de la espera tiene saldo vigente
- **THEN** el lugar queda disponible para una reserva nueva
- **AND** no se emite una oferta

### Requirement: Aceptación de oferta

Aceptar una oferta DEBE confirmar la reserva y descontar un crédito en la misma transacción, siempre dentro del plazo. Si al aceptar la alumna no tiene saldo, la oferta MUST vencer y el sistema MUST ofrecer el lugar a la siguiente elegible.

#### Scenario: Aceptación dentro del plazo

- **WHEN** una alumna con saldo acepta su oferta antes del vencimiento
- **THEN** la reserva queda confirmada
- **AND** se descuenta un crédito
- **AND** el lugar queda ocupado por ella

#### Scenario: Aceptación fuera del plazo

- **WHEN** una alumna intenta aceptar una oferta vencida
- **THEN** la operación es rechazada
- **AND** no se descuenta crédito
- **AND** la oferta queda vencida

#### Scenario: Sin saldo al aceptar

- **WHEN** una alumna acepta una oferta pero su saldo dejó de ser suficiente
- **THEN** la oferta queda vencida
- **AND** no se descuenta crédito
- **AND** el lugar se ofrece a la siguiente alumna elegible

### Requirement: Vencimiento de ofertas

Una oferta no aceptada DEBE vencer al cumplirse su plazo. Al vencer, el sistema MUST liberar la reserva ofrecida y MUST ofrecer el lugar a la siguiente alumna elegible, sin intervención manual.

#### Scenario: Oferta no aceptada

- **WHEN** pasan 120 minutos desde una oferta sin respuesta
- **THEN** la oferta queda vencida
- **AND** el lugar se ofrece a la siguiente alumna elegible
- **AND** se encola el aviso correspondiente

#### Scenario: Procesamiento repetido del vencimiento

- **WHEN** el proceso de vencimiento corre dos veces sobre la misma oferta
- **THEN** la oferta se procesa una sola vez
- **AND** no se emiten dos ofertas para el mismo lugar

### Requirement: Cancelación por la alumna con política de cuatro horas

La alumna DEBE poder cancelar una reserva futura. Con 4 horas o más de anticipación, el sistema MUST devolver el crédito; con menos de 4 horas, MUST NOT devolverlo. En ambos casos MUST liberar el lugar y MUST promover la lista de espera. Una reserva ya comenzada MUST NOT poder cancelarse.

#### Scenario: Cancelación con cinco horas

- **WHEN** una alumna cancela una reserva confirmada 5 horas antes de la sesión
- **THEN** se le devuelve un crédito
- **AND** el lugar se libera
- **AND** la primera alumna elegible de la espera recibe una oferta

#### Scenario: Cancelación con dos horas

- **WHEN** una alumna cancela una reserva confirmada 2 horas antes de la sesión
- **THEN** no se le devuelve el crédito
- **AND** el lugar se libera
- **AND** la primera alumna elegible de la espera recibe una oferta

#### Scenario: Cancelación después de comenzada

- **WHEN** una alumna intenta cancelar una reserva de una sesión que ya comenzó
- **THEN** la operación es rechazada
- **AND** el crédito no se devuelve

#### Scenario: Cancelación de una oferta

- **WHEN** una alumna cancela una reserva en estado ofrecida
- **THEN** no se devuelve crédito porque nunca se descontó
- **AND** el lugar se libera y se promueve la espera

#### Scenario: Cancelación repetida

- **WHEN** se procesa dos veces la cancelación de la misma reserva
- **THEN** se devuelve como máximo un crédito
- **AND** se emite como máximo una promoción de espera

### Requirement: Asistencia marcada por la instructora

La instructora asignada DEBE poder marcar como asistió o ausente cada reserva confirmada de una sesión que ya comenzó. Marcar ausente MUST NOT devolver ni recuperar el crédito, porque ya se consumió al reservar. La marcación MUST ser idempotente.

#### Scenario: Alumna presente

- **WHEN** la instructora marca como asistió a una alumna confirmada
- **THEN** la reserva queda en estado asistió
- **AND** su saldo no cambia

#### Scenario: Alumna ausente

- **WHEN** la instructora marca como ausente a una alumna confirmada
- **THEN** la reserva queda en estado ausente
- **AND** no se devuelve el crédito
- **AND** el saldo no cambia

#### Scenario: Marcación repetida

- **WHEN** la instructora vuelve a marcar la misma reserva con el mismo estado
- **THEN** la operación no produce cambios adicionales
- **AND** no se generan movimientos de crédito

#### Scenario: Instructora ajena

- **WHEN** una instructora intenta marcar asistencia en una sesión de otra instructora
- **THEN** la operación es rechazada por falta de permisos

### Requirement: Transiciones de estado válidas

Una reserva DEBE respetar las transiciones permitidas entre confirmada, en espera, ofrecida, asistió, ausente, cancelada y oferta vencida. Cualquier transición no permitida MUST rechazarse sin alterar el cupo ni el saldo.

#### Scenario: De espera a ofrecida

- **WHEN** se libera un lugar y la primera alumna elegible está en espera
- **THEN** su reserva pasa de en espera a ofrecida

#### Scenario: De ofrecida a confirmada

- **WHEN** la alumna acepta la oferta
- **THEN** su reserva pasa de ofrecida a confirmada
- **AND** se descuenta un crédito

#### Scenario: Transición inválida

- **WHEN** se intenta pasar una reserva cancelada a confirmada sin una nueva reserva
- **THEN** la operación es rechazada
- **AND** no se descuenta crédito
