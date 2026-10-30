# Spec Delta

## Purpose

Ofrece a cada alumna una interfaz web para consultar su saldo e historial, ver las próximas clases, reservar, anotarse en lista de espera, aceptar ofertas y cancelar, sin necesidad de contactar al staff.

## ADDED Requirements

### Requirement: Acceso al portal con código

El portal DEBE ofrecer el flujo de solicitud y verificación de código sin contraseña. Las rutas de datos MUST exigir una sesión de alumna válida y MUST redirigir al acceso cuando no la haya.

#### Scenario: Ingreso exitoso

- **WHEN** la alumna solicita un código, lo recibe y lo ingresa correctamente
- **THEN** accede a su portal
- **AND** ve su saldo y sus próximas reservas

#### Scenario: Acceso directo sin sesión

- **WHEN** una persona sin sesión abre una ruta del portal
- **THEN** es redirigida a la pantalla de acceso
- **AND** no se muestran datos de ninguna alumna

#### Scenario: Cierre de sesión

- **WHEN** la alumna usa la opción de cerrar sesión
- **THEN** vuelve a la pantalla de acceso
- **AND** las rutas protegidas dejan de estar disponibles

### Requirement: Consulta de saldo e historial

El portal DEBE mostrar cada paquete de la alumna con su saldo, fecha de compra, vencimiento y estado, además del historial de movimientos en orden cronológico descendente. Cada movimiento MUST mostrar tipo, fecha, delta, saldo resultante y la clase o reserva asociada cuando corresponda, y MUST ser de solo lectura.

#### Scenario: Saldo vigente

- **WHEN** la alumna abre su cuenta
- **THEN** ve el saldo de cada paquete activo
- **AND** el total coincide con la suma de los movimientos

#### Scenario: Historial con detalle

- **WHEN** la alumna consulta su historial
- **THEN** ve los movimientos de compra, reserva, devolución, vencimiento y ajuste
- **AND** cada uno muestra su fecha, delta y saldo resultante
- **AND** los movimientos de reserva y devolución muestran la clase asociada

#### Scenario: Paquete vencido

- **WHEN** la alumna tiene un paquete vencido
- **THEN** el portal lo muestra con estado vencido y saldo 0
- **AND** no permite usarlo para reservar

#### Scenario: Historial no editable

- **WHEN** la alumna intenta editar o borrar un movimiento desde el portal
- **THEN** no existe ninguna acción disponible para hacerlo

### Requirement: Listado de próximas clases

El portal DEBE mostrar las sesiones futuras programadas con fecha y hora en Buenos Aires, instructora, cupo total, lugares disponibles y el estado de la reserva de la alumna si existe; la API MUST devolver esos datos en el mismo orden.

#### Scenario: Clase con lugares

- **WHEN** la alumna consulta las próximas clases
- **THEN** ve las sesiones futuras con sus lugares disponibles
- **AND** las fechas se muestran en `America/Argentina/Buenos_Aires`

#### Scenario: Clase llena

- **WHEN** una sesión no tiene lugares disponibles
- **THEN** el portal la muestra como llena
- **AND** ofrece la opción de anotarse en lista de espera

#### Scenario: Clase cancelada

- **WHEN** una sesión fue cancelada
- **THEN** no aparece como disponible para reservar
- **AND** la alumna ve el estado cancelado de su reserva si la tenía

### Requirement: Reserva desde el portal

La alumna DEBE poder reservar una sesión futura con lugares disponibles y saldo vigente. Si la sesión está llena, el portal MUST ofrecer anotarse en lista de espera. Si no hay saldo, MUST informar la falta de créditos y MUST NOT confirmar la reserva.

#### Scenario: Reserva confirmada

- **WHEN** la alumna reserva una sesión con lugar y saldo
- **THEN** la reserva queda confirmada
- **AND** el portal muestra el nuevo saldo y la reserva

#### Scenario: Reserva en lista de espera

- **WHEN** la alumna reserva una sesión llena
- **THEN** queda en lista de espera
- **AND** el portal muestra su posición en la cola
- **AND** su saldo no cambia

#### Scenario: Reserva sin saldo

- **WHEN** la alumna intenta reservar una sesión con lugar pero sin saldo vigente
- **THEN** el portal muestra que no tiene créditos disponibles
- **AND** no confirma la reserva

#### Scenario: Reserva duplicada

- **WHEN** la alumna ya tiene una reserva activa en la sesión
- **THEN** el portal no le permite reservar otra vez
- **AND** le muestra el estado de su reserva existente

### Requirement: Oferta de lugar con plazo visible

Cuando la alumna tiene una oferta de lugar, el portal DEBE mostrarla con la fecha y hora límite en Buenos Aires y MUST permitir aceptarla mientras esté vigente. Al aceptar, MUST confirmar la reserva y descontar un crédito.

#### Scenario: Oferta vigente

- **WHEN** la alumna recibe una oferta
- **THEN** el portal muestra el lugar ofrecido y el plazo de aceptación
- **AND** el plazo se muestra en hora de Buenos Aires

#### Scenario: Aceptación de la oferta

- **WHEN** la alumna acepta la oferta dentro del plazo y tiene saldo
- **THEN** la reserva queda confirmada
- **AND** el portal muestra el crédito descontado

#### Scenario: Oferta vencida

- **WHEN** la alumna abre una oferta vencida
- **THEN** el portal la muestra como vencida
- **AND** no permite aceptarla

#### Scenario: Oferta sin saldo

- **WHEN** la alumna acepta una oferta pero ya no tiene saldo
- **THEN** el portal informa que la oferta no pudo confirmarse
- **AND** no descuenta crédito

### Requirement: Cancelación con política visible

Antes de cancelar, el portal DEBE informar si la cancelación devuelve o no el crédito según la anticipación de 4 horas. La alumna MUST poder confirmar o desistir, y al cancelar MUST ver el resultado y el saldo actualizado.

#### Scenario: Cancelación con devolución

- **WHEN** la alumna cancela con 4 horas o más de anticipación
- **THEN** el portal le informa que recuperará el crédito
- **AND** tras confirmar, muestra el saldo actualizado

#### Scenario: Cancelación sin devolución

- **WHEN** la alumna cancela con menos de 4 horas de anticipación
- **THEN** el portal le informa que no recuperará el crédito
- **AND** tras confirmar, libera el lugar y muestra el saldo sin cambios

#### Scenario: Desistir de la cancelación

- **WHEN** la alumna abre el aviso de cancelación y elige volver
- **THEN** la reserva no cambia
- **AND** el crédito no se modifica

#### Scenario: Cancelación de una oferta

- **WHEN** la alumna cancela una oferta de lugar
- **THEN** el portal le informa que no había crédito descontado
- **AND** la oferta se libera

### Requirement: Datos propios y solo lectura de cuenta

El portal DEBE mostrar únicamente los datos de la alumna autenticada. La alumna MUST poder consultar su nombre, teléfono y email, pero MUST NOT poder modificar su email ni acceder a cuentas de otras alumnas.

#### Scenario: Datos de la cuenta

- **WHEN** la alumna abre su perfil
- **THEN** ve su nombre, teléfono y email registrados

#### Scenario: Modificación de email

- **WHEN** la alumna intenta cambiar su email desde el portal
- **THEN** la acción no está disponible
- **AND** el email permanece sin cambios

#### Scenario: Intento de acceder a otra cuenta

- **WHEN** la alumna manipula la URL o la petición para consultar datos de otra alumna
- **THEN** el portal no muestra esos datos
- **AND** la API rechaza la operación

### Requirement: Portal sin información de dinero

El portal DEBE mostrar créditos, fechas y estados, y MUST NOT mostrar precios, importes, medios de pago ni acciones de compra.

#### Scenario: Detalle de paquete

- **WHEN** la alumna consulta un paquete
- **THEN** ve nombre del plan, créditos comprados, saldo y vencimiento
- **AND** no ve ningún precio ni importe
