# Spec Delta

## Purpose

Define los horarios semanales y las sesiones concretas con cupo e instructora, almacenadas en UTC y presentadas en la zona del estudio, para que reservas, asistencia y cancelaciones operen sobre una única fuente de verdad.

## ADDED Requirements

### Requirement: Plantillas semanales

La administradora DEBE poder crear y editar plantillas con día de la semana, hora local, duración, cupo e instructora. Una plantilla MUST exigir cupo mayor a 0, duración mayor a 0 y una instructora activa con rol de instructora.

#### Scenario: Alta de plantilla válida

- **WHEN** la administradora crea una plantilla para los martes a las 18:00, 60 minutos, cupo 12 e instructora Ana
- **THEN** la plantilla queda activa con esos valores

#### Scenario: Cupo inválido

- **WHEN** la administradora intenta crear una plantilla con cupo 0 o negativo
- **THEN** la operación es rechazada
- **AND** no se crea la plantilla

#### Scenario: Instructora sin permiso de plantillas

- **WHEN** una instructora intenta crear o editar una plantilla
- **THEN** la operación es rechazada por falta de permisos

### Requirement: Generación idempotente de sesiones

La administradora DEBE poder generar sesiones concretas a partir de una plantilla para un rango de fechas. La hora local MUST convertirse a UTC al almacenar, y cada sesión MUST guardar una copia del cupo y la instructora vigentes al generarse. Volver a generar el mismo rango MUST NOT duplicar sesiones ni crear sesiones en el pasado.

#### Scenario: Generación de cuatro semanas

- **WHEN** la administradora genera las sesiones de una plantilla de los martes 18:00 de Buenos Aires para cuatro semanas
- **THEN** se crean cuatro sesiones
- **AND** cada una queda almacenada a las 21:00 UTC del martes correspondiente

#### Scenario: Regeneración del mismo rango

- **WHEN** la administradora vuelve a generar el mismo rango para la misma plantilla
- **THEN** no se crean sesiones duplicadas
- **AND** las sesiones existentes no se modifican

#### Scenario: Rango con fechas pasadas

- **WHEN** el rango solicitado incluye fechas anteriores al momento actual
- **THEN** solo se crean las sesiones futuras
- **AND** el resultado informa cuántas sesiones se crearon y cuántas se omitieron

#### Scenario: Cambio posterior de la plantilla

- **WHEN** la administradora cambia el cupo o la instructora de una plantilla
- **THEN** las sesiones ya generadas conservan el cupo y la instructora que tenían al generarse

### Requirement: Edición de sesiones futuras

La administradora DEBE poder cambiar el cupo o la instructora de una sesión programada que no haya comenzado. El cupo MUST NOT reducirse por debajo de la cantidad de reservas confirmadas y ofrecidas. Si el cupo aumenta y hay lista de espera, el sistema MUST ofrecer el lugar liberado a la primera alumna elegible.

#### Scenario: Reducción por debajo de lo ocupado

- **WHEN** una sesión tiene 10 reservas confirmadas y la administradora intenta bajar el cupo a 8
- **THEN** la operación es rechazada
- **AND** el cupo sigue siendo 10 o más

#### Scenario: Aumento de cupo con espera

- **WHEN** una sesión llena con lista de espera aumenta su cupo en 1
- **THEN** la primera alumna elegible de la espera recibe una oferta de lugar
- **AND** se encola el aviso correspondiente

#### Scenario: Sesión ya comenzada

- **WHEN** la administradora intenta editar el cupo de una sesión que ya comenzó
- **THEN** la operación es rechazada

### Requirement: Estados de sesión

Cada sesión DEBE estar en estado programada, cancelada o completada. Una sesión cancelada MUST NOT aceptar nuevas reservas ni ofertas, y una sesión completada MUST NOT admitir cambios de cupo.

#### Scenario: Sesión cancelada

- **WHEN** una sesión pasa a cancelada
- **THEN** no se aceptan nuevas reservas sobre ella
- **AND** las reservas existentes se procesan según la regla de cancelación de clase

#### Scenario: Sesión completada

- **WHEN** una sesión termina y pasa a completada
- **THEN** ya no admite cambios de cupo ni nuevas reservas

### Requirement: Cancelación de clase por la instructora o la administradora

La instructora asignada DEBE poder cancelar sus propias sesiones futuras y la administradora MUST poder cancelar cualquier sesión futura. Al cancelar, el sistema MUST devolver un crédito a cada reserva confirmada, MUST marcar las reservas activas como canceladas y MUST encolar un aviso para cada alumna afectada, todo sin realizar llamadas de red dentro del request.

#### Scenario: Cancelación con 12 inscriptas

- **WHEN** la instructora cancela una sesión futura con 12 reservas confirmadas
- **THEN** se registran 12 devoluciones de crédito
- **AND** se encolan 12 avisos pendientes
- **AND** no se realiza ninguna llamada de red durante la operación

#### Scenario: Instructora cancela una clase ajena

- **WHEN** una instructora intenta cancelar una sesión asignada a otra instructora
- **THEN** la operación es rechazada por falta de permisos
- **AND** la sesión sigue programada

#### Scenario: Alumnas en espera

- **WHEN** se cancela una sesión que tenía alumnas en lista de espera
- **THEN** sus reservas quedan canceladas
- **AND** no se les devuelve crédito porque nunca se les descontó
- **AND** se les encola el aviso de cancelación

#### Scenario: Cancelación repetida

- **WHEN** se intenta cancelar dos veces la misma sesión
- **THEN** la segunda operación no genera devoluciones ni avisos adicionales
- **AND** la sesión permanece cancelada

### Requirement: Fechas en UTC y presentación en Buenos Aires

El sistema DEBE almacenar todas las fechas y horas en UTC. Las respuestas de la API y la interfaz MUST presentar las fechas en `America/Argentina/Buenos_Aires`, y las comparaciones de negocio MUST hacerse sobre el instante UTC.

#### Scenario: Hora local convertida a UTC

- **WHEN** se genera una sesión para las 18:00 de Buenos Aires
- **THEN** el instante almacenado es las 21:00 UTC del mismo día

#### Scenario: Presentación al usuario

- **WHEN** una alumna o una instructora consulta una sesión almacenada a las 21:00 UTC
- **THEN** la interfaz muestra las 18:00 en `America/Argentina/Buenos_Aires`

### Requirement: Disponibilidad visible por sesión

El listado de sesiones DEBE exponer fecha y hora local, instructora, cupo total, lugares ocupados, lugares disponibles y cantidad en lista de espera. Los lugares ocupados MUST incluir reservas confirmadas y ofrecidas, y MUST NOT superar el cupo.

#### Scenario: Sesión con lugares libres

- **WHEN** se consulta una sesión con cupo 12 y 5 reservas confirmadas
- **THEN** el listado informa 5 ocupados y 7 disponibles

#### Scenario: Sesión llena

- **WHEN** se consulta una sesión con cupo 12, 12 reservas confirmadas u ofrecidas y 3 alumnas en espera
- **THEN** el listado informa 0 disponibles y 3 en lista de espera
- **AND** la sesión se muestra como llena con lista de espera disponible
