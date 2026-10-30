# Spec Delta

## Purpose

Entrega los avisos de WhatsApp de forma asíncrona e idempotente: el request solo encola en una outbox y un worker los envía después, con plantillas de parámetros fijos, respeto del consentimiento y un driver de log que funciona sin credenciales de Meta.

## ADDED Requirements

### Requirement: Outbox transaccional sin red en el request

Todo aviso automático DEBE encolarse en una outbox dentro de la misma transacción que origina el evento. El request que confirma una reserva, cancela una clase o libera un lugar MUST NOT realizar llamadas HTTP ni bloquear esperando al proveedor.

#### Scenario: Reserva confirmada

- **WHEN** se confirma una reserva
- **THEN** se crea una notificación pendiente para la alumna
- **AND** el request termina sin llamadas de red

#### Scenario: Doce cancelaciones de clase

- **WHEN** se cancela una clase con 12 alumnas confirmadas
- **THEN** quedan 12 notificaciones pendientes
- **AND** no se realiza ninguna llamada de red durante el request

#### Scenario: Lugar liberado

- **WHEN** se libera un lugar y se ofrece a una alumna
- **THEN** se encola el aviso de lugar liberado
- **AND** el aviso no se envía dentro de la transacción

#### Scenario: Fallo al encolar

- **WHEN** falla la inserción de la notificación dentro de la transacción del evento
- **THEN** la operación completa se revierte
- **AND** no queda una reserva o cancelación sin su aviso correspondiente

### Requirement: Eventos y plantillas con parámetros en orden fijo

El sistema DEBE tener una plantilla por evento: reserva confirmada, clase cancelada y lugar liberado. Cada plantilla MUST recibir una cantidad fija de parámetros en un orden definido y MUST rechazar parámetros faltantes, sobrantes o fuera de orden.

#### Scenario: Plantilla de reserva confirmada

- **WHEN** se encola una reserva confirmada
- **THEN** la plantilla recibe nombre de la alumna, fecha y hora de la clase, instructora y saldo restante
- **AND** el mensaje renderizado respeta ese orden

#### Scenario: Plantilla de clase cancelada

- **WHEN** se encola la cancelación de una clase
- **THEN** la plantilla recibe nombre de la alumna, fecha y hora de la clase y si se devolvió el crédito
- **AND** el mensaje renderizado respeta ese orden

#### Scenario: Plantilla de lugar liberado

- **WHEN** se encola una oferta de lugar
- **THEN** la plantilla recibe nombre de la alumna, fecha y hora de la clase y fecha y hora límite para aceptar
- **AND** el mensaje renderizado respeta ese orden

#### Scenario: Parámetros inválidos

- **WHEN** se intenta encolar un aviso con parámetros faltantes o adicionales
- **THEN** la operación es rechazada
- **AND** no se crea una notificación inválida

### Requirement: Idempotencia de avisos

Cada aviso DEBE tener una clave de idempotencia única derivada del evento, la destinataria y la reserva o clase. Volver a procesar el mismo evento MUST NOT crear una segunda notificación ni enviar dos veces el mismo aviso.

#### Scenario: Evento duplicado

- **WHEN** se intenta encolar dos veces el aviso de la misma reserva confirmada
- **THEN** existe una sola notificación para esa clave
- **AND** el worker la envía una sola vez

#### Scenario: Reintento del worker

- **WHEN** el worker reintenta una notificación pendiente
- **THEN** reutiliza la misma clave de idempotencia
- **AND** no crea una notificación nueva

#### Scenario: Claves distintas

- **WHEN** dos alumnas distintas reciben el aviso de la misma clase cancelada
- **THEN** cada una tiene su propia clave
- **AND** ambas notificaciones se procesan de forma independiente

### Requirement: Consentimiento de WhatsApp

El sistema DEBE enviar avisos por WhatsApp únicamente a alumnas con consentimiento registrado. Si la alumna no dio consentimiento o lo retiró, la notificación MUST quedar como omitida y MUST NOT intentar ningún envío.

#### Scenario: Alumna con consentimiento

- **WHEN** se encola un aviso para una alumna con consentimiento vigente
- **THEN** la notificación queda pendiente de envío

#### Scenario: Alumna sin consentimiento

- **WHEN** se encola un aviso para una alumna sin consentimiento
- **THEN** la notificación queda en estado omitida
- **AND** no se intenta ningún envío
- **AND** no se realizan llamadas de red

#### Scenario: Consentimiento retirado

- **WHEN** una alumna retira su consentimiento antes del envío
- **THEN** el worker omite el aviso
- **AND** la notificación queda como omitida

### Requirement: Driver de log por defecto

El sistema DEBE operar sin credenciales de Meta usando un driver de log que registre el mensaje renderizado y marque la notificación como enviada sin hacer red. El driver de Meta MUST ser opcional y MUST usar exclusivamente el número nuevo configurado para la API.

#### Scenario: Operación sin credenciales

- **WHEN** el sistema se ejecuta con la configuración por defecto
- **THEN** los avisos se procesan con el driver de log
- **AND** no se requiere token ni número de Meta
- **AND** no se realizan llamadas de red

#### Scenario: Driver de Meta configurado

- **WHEN** se configura el driver de Meta con el número nuevo
- **THEN** los envíos usan ese número
- **AND** el número actual del estudio no se utiliza en ninguna llamada

#### Scenario: Credenciales ausentes con driver de Meta

- **WHEN** se selecciona el driver de Meta sin las credenciales requeridas
- **THEN** el sistema falla al iniciar con un mensaje claro
- **AND** no intenta enviar avisos

### Requirement: Reintentos y estados de notificación

Cada notificación DEBE tener estado pendiente, enviada, fallida u omitida, cantidad de intentos y último error. Un envío fallido MUST reintentarse con espera creciente hasta un máximo de intentos; al agotarlos MUST quedar fallida sin bloquear la outbox.

#### Scenario: Envío exitoso

- **WHEN** el worker procesa una notificación pendiente correctamente
- **THEN** la notificación queda enviada
- **AND** registra un intento y la fecha de envío

#### Scenario: Fallo transitorio

- **WHEN** el proveedor falla en el primer intento
- **THEN** la notificación vuelve a pendiente con un próximo intento programado
- **AND** los demás avisos siguen procesándose

#### Scenario: Máximo de intentos

- **WHEN** una notificación supera el máximo de intentos configurado
- **THEN** queda en estado fallida
- **AND** conserva el último error
- **AND** no se reintenta automáticamente

#### Scenario: Aviso omitido

- **WHEN** una notificación no debe enviarse por falta de consentimiento o por datos inválidos
- **THEN** queda en estado omitida
- **AND** no consume intentos de envío

### Requirement: Procesamiento concurrente sin duplicados

Varios workers DEBEN poder procesar la outbox al mismo tiempo sin enviar dos veces la misma notificación. Cada notificación MUST ser reclamada por un solo worker y MUST liberarse si el worker falla.

#### Scenario: Dos workers simultáneos

- **WHEN** dos workers procesan la outbox al mismo tiempo
- **THEN** cada notificación se envía una sola vez
- **AND** ninguno bloquea al otro

#### Scenario: Worker interrumpido

- **WHEN** un worker toma una notificación y se interrumpe antes de marcarla
- **THEN** la notificación vuelve a estar disponible para otro worker
- **AND** no queda bloqueada para siempre

### Requirement: Fechas de los avisos en Buenos Aires

Los mensajes DEBEN mostrar las fechas y horas de las clases y de los plazos en `America/Argentina/Buenos_Aires`, aunque el sistema las almacene en UTC; el worker MUST renderizarlas en esa zona.

#### Scenario: Aviso de reserva

- **WHEN** se renderiza un aviso de una clase almacenada a las 21:00 UTC
- **THEN** el mensaje muestra las 18:00 de Buenos Aires

#### Scenario: Plazo de oferta

- **WHEN** se renderiza un aviso de lugar liberado con vencimiento a las 23:00 UTC
- **THEN** el mensaje muestra las 20:00 de Buenos Aires
