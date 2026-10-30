# Spec Delta

## Purpose

Permite que la administradora y las instructoras operen el estudio desde un panel con permisos separados: la administradora gestiona alumnas, paquetes, horarios y ajustes; las instructoras solo pasan lista y cancelan sus propias clases.

## ADDED Requirements

### Requirement: Autenticación de staff con email y contraseña

El staff DEBE acceder con email y contraseña. Las contraseñas MUST almacenarse hasheadas, las cuentas MUST crearse por aprovisionamiento administrativo y MUST NOT existir auto-registro público. Un login fallido MUST responder con un mensaje genérico.

#### Scenario: Login correcto

- **WHEN** una instructora ingresa su email y contraseña correctos
- **THEN** accede al panel con su rol
- **AND** ve únicamente las secciones permitidas para ese rol

#### Scenario: Contraseña incorrecta

- **WHEN** se ingresa una contraseña incorrecta
- **THEN** el acceso es rechazado con un mensaje genérico
- **AND** no se revela si el email existe

#### Scenario: Cuenta inactiva

- **WHEN** una cuenta de staff desactivada intenta ingresar
- **THEN** el acceso es rechazado
- **AND** no se crea sesión

#### Scenario: Auto-registro

- **WHEN** alguien intenta crear una cuenta de staff desde el panel o la API pública
- **THEN** la operación no está disponible
- **AND** solo el aprovisionamiento administrativo puede crear cuentas

### Requirement: Roles y permisos separados

El panel DEBE distinguir dos roles: administradora e instructora. La administradora MUST poder gestionar alumnas, planes, paquetes, ajustes, plantillas, sesiones y cancelaciones. La instructora MUST limitarse a ver sus propias clases y las alumnas anotadas en ellas, marcar asistencia y cancelar sus propias clases.

#### Scenario: Instructora intenta ajustar créditos

- **WHEN** una instructora intenta ajustar el saldo de una alumna
- **THEN** la operación es rechazada por falta de permisos
- **AND** no se inserta ningún movimiento

#### Scenario: Instructora intenta crear un plan

- **WHEN** una instructora intenta crear o editar un plan de paquetes
- **THEN** la operación es rechazada por falta de permisos

#### Scenario: Instructora cancela una clase ajena

- **WHEN** una instructora intenta cancelar una clase asignada a otra instructora
- **THEN** la operación es rechazada por falta de permisos

#### Scenario: Administradora con permisos completos

- **WHEN** la administradora crea un plan, registra un paquete o ajusta créditos
- **THEN** la operación se realiza correctamente
- **AND** queda registrada en el historial de créditos cuando corresponde

#### Scenario: Instructora ve solo sus clases

- **WHEN** una instructora consulta el listado de clases
- **THEN** solo ve las sesiones asignadas a ella
- **AND** no ve las clases de otras instructoras

### Requirement: Gestión de alumnas

La administradora DEBE poder crear y editar alumnas con nombre, teléfono en formato E.164 único, email opcional y consentimiento de WhatsApp con fecha. El sistema MUST rechazar un teléfono duplicado y MUST permitir retirar el consentimiento.

#### Scenario: Alta de alumna

- **WHEN** la administradora crea una alumna con nombre, teléfono +5491123456789 y consentimiento de WhatsApp
- **THEN** la alumna queda registrada con la fecha de consentimiento
- **AND** puede recibir avisos por WhatsApp

#### Scenario: Teléfono duplicado

- **WHEN** la administradora intenta registrar un teléfono que ya pertenece a otra alumna
- **THEN** la operación es rechazada
- **AND** no se crea una segunda alumna

#### Scenario: Teléfono inválido

- **WHEN** la administradora ingresa un teléfono que no cumple E.164
- **THEN** la operación es rechazada con un mensaje de formato

#### Scenario: Retiro de consentimiento

- **WHEN** la administradora quita el consentimiento de WhatsApp de una alumna
- **THEN** la fecha de consentimiento queda vacía
- **AND** la alumna deja de recibir avisos por WhatsApp

#### Scenario: Cambio de email

- **WHEN** la administradora modifica el email de una alumna
- **THEN** el nuevo email queda registrado
- **AND** los códigos de acceso se envían al nuevo email

### Requirement: Consulta de paquetes e historial de una alumna

La administradora DEBE poder consultar los paquetes, saldos, vencimientos y movimientos de cualquier alumna. La instructora MUST NOT acceder a esa información fuera del roster de sus propias clases.

#### Scenario: Consulta administrativa

- **WHEN** la administradora abre la ficha de una alumna
- **THEN** ve sus paquetes con saldo y vencimiento
- **AND** ve su historial de movimientos con actor y motivo cuando corresponda

#### Scenario: Instructora sin acceso al historial

- **WHEN** una instructora intenta consultar los paquetes o movimientos de una alumna
- **THEN** la operación es rechazada por falta de permisos
- **AND** no se devuelve información de saldo

### Requirement: Planes de paquetes sin dinero

La administradora DEBE poder crear planes con nombre, cantidad de créditos y vigencia en días, con 90 días por defecto y vigencia nula para paquetes que no vencen. Los planes MUST NOT incluir precio, importe ni medio de pago.

#### Scenario: Plan de 10 clases

- **WHEN** la administradora crea un plan de 10 créditos con vigencia 90 días
- **THEN** el plan queda disponible para asignar a alumnas
- **AND** no se solicita ningún dato de dinero

#### Scenario: Plan sin vencimiento

- **WHEN** la administradora crea un plan con vigencia nula
- **THEN** los paquetes generados con ese plan no vencen

#### Scenario: Vigencia por defecto

- **WHEN** la administradora crea un plan sin indicar vigencia
- **THEN** el plan queda con vigencia de 90 días

### Requirement: Registro de compra de paquete

La administradora DEBE poder asignar un plan a una alumna registrando la compra. El sistema MUST crear el paquete con los créditos comprados, el saldo inicial y el vencimiento calculado, y MUST insertar el movimiento de compra correspondiente en la misma transacción.

#### Scenario: Compra registrada

- **WHEN** la administradora registra la compra de un plan de 10 créditos para una alumna
- **THEN** se crea un paquete con 10 créditos comprados y saldo 10
- **AND** se registra un movimiento de compra +10
- **AND** el vencimiento se calcula según la vigencia del plan

#### Scenario: Compra con plan sin vencimiento

- **WHEN** la administradora registra la compra de un plan sin vigencia
- **THEN** el paquete queda sin fecha de vencimiento

#### Scenario: Compra fallida

- **WHEN** falla la creación del movimiento de compra
- **THEN** el paquete no queda creado
- **AND** el saldo de la alumna no cambia

### Requirement: Ajuste manual de créditos

La administradora DEBE poder ajustar el saldo de un paquete sumando o restando créditos, con motivo obligatorio. El ajuste MUST registrarse como movimiento de ajuste y MUST NOT permitir un saldo negativo.

#### Scenario: Ajuste positivo

- **WHEN** la administradora agrega 2 créditos con el motivo "compensación"
- **THEN** se registra un movimiento de ajuste +2 con actor y motivo
- **AND** el saldo aumenta en 2

#### Scenario: Ajuste negativo válido

- **WHEN** la administradora resta 1 crédito con motivo y el saldo resultante es 0 o mayor
- **THEN** se registra un movimiento de ajuste -1
- **AND** el saldo disminuye en 1

#### Scenario: Ajuste que dejaría saldo negativo

- **WHEN** la administradora intenta restar más créditos que el saldo disponible
- **THEN** la operación es rechazada
- **AND** no se inserta ningún movimiento

#### Scenario: Ajuste sin motivo

- **WHEN** la administradora intenta un ajuste sin motivo
- **THEN** la operación es rechazada

### Requirement: Gestión de horarios y sesiones

La administradora DEBE poder crear plantillas, generar sesiones y editar sesiones futuras desde el panel. La interfaz MUST mostrar las fechas en Buenos Aires y MUST advertir cuando una acción afecta reservas existentes.

#### Scenario: Generación desde el panel

- **WHEN** la administradora genera sesiones para un rango de fechas
- **THEN** el panel informa cuántas sesiones se crearon y cuántas se omitieron
- **AND** las fechas se muestran en Buenos Aires

#### Scenario: Edición con reservas

- **WHEN** la administradora intenta reducir el cupo por debajo de las reservas ocupadas
- **THEN** el panel muestra el error y no aplica el cambio

#### Scenario: Cancelación con afectadas

- **WHEN** la administradora cancela una clase con alumnas inscriptas
- **THEN** el panel muestra cuántas alumnas serán afectadas antes de confirmar
- **AND** al confirmar se procesan las devoluciones y los avisos

### Requirement: Asistencia y cancelación desde el panel

La instructora asignada DEBE poder ver el listado de alumnas de su clase y marcar asistencia. La instructora MUST poder cancelar su clase futura y la administradora MUST poder cancelar cualquier clase futura. Los avisos y devoluciones MUST ejecutarse sin llamadas de red dentro del request.

#### Scenario: Listado de alumnas

- **WHEN** la instructora abre una de sus sesiones
- **THEN** ve las alumnas confirmadas con su estado de asistencia, las ofrecidas y las que están en espera con su posición
- **AND** no ve alumnas de otras sesiones

#### Scenario: Marcación de asistencia

- **WHEN** la instructora marca a una alumna como asistió
- **THEN** el estado se guarda
- **AND** el saldo de la alumna no cambia

#### Scenario: Cancelación de clase

- **WHEN** la instructora cancela su propia clase futura
- **THEN** se devuelven los créditos a las alumnas confirmadas
- **AND** se encolan los avisos
- **AND** el request termina sin llamadas de red

### Requirement: Sin funcionalidades fuera de alcance

El panel DEBE limitarse a alumnas, paquetes, horarios, sesiones, reservas, asistencia y cancelaciones. MUST NOT incluir videos, rutinas, tienda, pagos, precios, facturación, multi-sede, multi-idioma ni chat.

#### Scenario: Secciones del panel

- **WHEN** la administradora inicia sesión
- **THEN** el menú solo contiene las secciones de gestión del estudio
- **AND** no existe ninguna sección de pagos, tienda, videos ni chat
