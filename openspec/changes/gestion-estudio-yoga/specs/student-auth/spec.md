# Spec Delta

## Purpose

Permite que cada alumna acceda a su propia información sin contraseña mediante un código de un solo uso enviado a su email, con protección contra fuerza bruta y sin revelar si un contacto está registrado.

## ADDED Requirements

### Requirement: Solicitud de código con respuesta uniforme

La alumna DEBE poder solicitar un código de 6 dígitos indicando su email. La API MUST responder con el mismo estado y el mismo cuerpo exista o no una alumna con ese email, y MUST NOT revelar si el contacto está registrado.

#### Scenario: Email registrado

- **WHEN** una alumna registrada solicita un código para su email
- **THEN** la API responde con el mensaje genérico de envío
- **AND** se envía un código a ese email

#### Scenario: Email no registrado

- **WHEN** se solicita un código para un email que no pertenece a ninguna alumna
- **THEN** la API responde con el mismo estado y el mismo cuerpo que en el caso anterior
- **AND** no se envía ningún código

#### Scenario: Alumna sin email

- **WHEN** una alumna sin email registrado solicita acceso
- **THEN** la respuesta es la misma que para cualquier otro contacto
- **AND** no se envía ningún código

### Requirement: Código hasheado, temporal y de un solo uso

El código DEBE tener 6 dígitos, MUST almacenarse hasheado y MUST NOT poder recuperarse en texto plano desde la base de datos. DEBE vencer a los 10 minutos, MUST admitir como máximo 5 intentos y MUST consumirse al usarse correctamente una sola vez.

#### Scenario: Uso correcto del código

- **WHEN** la alumna ingresa el código correcto dentro de los 10 minutos
- **THEN** se crea una sesión
- **AND** el código queda consumido
- **AND** el mismo código ya no puede volver a usarse

#### Scenario: Código vencido

- **WHEN** la alumna ingresa el código después de 10 minutos
- **THEN** el acceso es rechazado
- **AND** no se crea ninguna sesión

#### Scenario: Quinto intento incorrecto

- **WHEN** la alumna ingresa 5 códigos incorrectos para la misma solicitud
- **THEN** el código queda invalidado
- **AND** un intento posterior con el código correcto también es rechazado

#### Scenario: Código reutilizado

- **WHEN** se intenta usar un código que ya fue consumido
- **THEN** el acceso es rechazado
- **AND** no se crea una segunda sesión

#### Scenario: Código no adivinable

- **WHEN** se inspecciona el almacenamiento de un código
- **THEN** solo existe su hash y sus metadatos
- **AND** no existe el código en texto plano

### Requirement: Límite de solicitudes

El sistema DEBE aceptar como máximo 3 solicitudes de código por contacto en una hora. La cuarta solicitud dentro de la hora MUST rechazarse, y el límite MUST aplicarse también a contactos inexistentes para no filtrar registros.

#### Scenario: Cuarta solicitud en la hora

- **WHEN** un contacto solicita un cuarto código dentro de la misma hora
- **THEN** la solicitud es rechazada por límite de frecuencia
- **AND** no se envía un nuevo código

#### Scenario: Nueva ventana horaria

- **WHEN** pasa una hora desde la primera solicitud
- **THEN** el contacto puede volver a solicitar códigos

#### Scenario: Contacto inexistente

- **WHEN** se hacen cuatro solicitudes para un email inexistente en una hora
- **THEN** la cuarta también es rechazada por límite de frecuencia
- **AND** el comportamiento no permite distinguir que el email no existe

### Requirement: Sesión de alumna de 90 días

Un código válido DEBE crear una sesión de 90 días para la alumna. La sesión MUST viajar en una cookie HttpOnly, MUST invalidarse al cerrar sesión y MUST rechazar el acceso cuando expire o sea revocada.

#### Scenario: Acceso exitoso

- **WHEN** la alumna ingresa un código válido
- **THEN** recibe una cookie de sesión HttpOnly
- **AND** puede consultar sus datos durante 90 días

#### Scenario: Cierre de sesión

- **WHEN** la alumna cierra sesión
- **THEN** el token deja de ser válido
- **AND** una petición posterior con ese token es rechazada

#### Scenario: Sesión vencida

- **WHEN** una petición usa una sesión con más de 90 días
- **THEN** la API responde no autenticado
- **AND** no devuelve datos de la alumna

#### Scenario: Acceso sin sesión

- **WHEN** una petición sin cookie intenta acceder al portal
- **THEN** la API responde no autenticado
- **AND** no devuelve datos

### Requirement: Aislamiento de datos entre alumnas

Una alumna autenticada DEBE poder acceder únicamente a sus propios datos. Cualquier intento de leer o modificar el saldo, historial, reservas u ofertas de otra alumna MUST rechazarse sin devolver información de la otra alumna.

#### Scenario: Consulta de saldo ajeno

- **WHEN** la alumna A solicita el saldo o el historial de la alumna B
- **THEN** la API rechaza la operación
- **AND** no devuelve ningún dato de B

#### Scenario: Cancelación de reserva ajena

- **WHEN** la alumna A intenta cancelar una reserva de la alumna B
- **THEN** la operación es rechazada
- **AND** la reserva de B no cambia
- **AND** no se devuelve crédito a ninguna de las dos

#### Scenario: Aceptación de oferta ajena

- **WHEN** la alumna A intenta aceptar una oferta de la alumna B
- **THEN** la operación es rechazada
- **AND** la oferta de B permanece vigente

#### Scenario: Listados propios

- **WHEN** una alumna consulta sus reservas o su historial
- **THEN** solo aparecen registros asociados a su propia cuenta

### Requirement: El código se envía solo al email registrado

El código DEBE enviarse únicamente al email que figura en el registro de la alumna. La solicitud MUST NOT permitir indicar un email de destino distinto al registrado ni reenviar el código a terceros.

#### Scenario: Email de destino

- **WHEN** una alumna registrada solicita un código
- **THEN** el código se envía a su email registrado
- **AND** no se acepta un destinatario alternativo

#### Scenario: Cambio de email por la alumna

- **WHEN** una alumna intenta cambiar su email desde el portal
- **THEN** la operación es rechazada
- **AND** solo la administradora puede modificarlo

### Requirement: Códigos de staff separados

El acceso de alumnas DEBE usar exclusivamente el flujo de código por email. Las credenciales de staff MUST NOT servir para autenticarse como alumna, y una sesión de alumna MUST NOT otorgar permisos de staff.

#### Scenario: Sesión de alumna en el panel

- **WHEN** una alumna autenticada intenta acceder a una ruta del panel de staff
- **THEN** la API responde sin permisos
- **AND** no devuelve datos de alumnas ni de staff

#### Scenario: Email de staff sin alumna asociada

- **WHEN** se solicita un código para el email de una instructora que no está registrada como alumna
- **THEN** la respuesta es la genérica
- **AND** no se emite ninguna sesión de alumna
