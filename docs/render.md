# Deploy en Render

Guía para publicar la demo de la consola en Render con PostgreSQL free. Es una demo de curso, no producción: la consola no tiene autenticación y usa datos de prueba. Incluye las vistas **Créditos** y **Clases**.

## Requisitos

- Cuenta gratuita de Render conectada a GitHub.
- Repo `Javierkaiser/estudio-yoga-facilito` con `render.yaml` en la raíz.
- No hace falta tarjeta para el plan free de Render (verificar el flujo de la cuenta).

## Blueprint

1. En Render: **New → Blueprint**.
2. Elegir el repositorio.
3. Render detecta `render.yaml` y muestra:
   - `estudio-yoga` (web service).
   - `estudio-yoga-db` (PostgreSQL free).
4. Revisar que la base y el servicio queden en la misma región.
5. **Apply**.

El `render.yaml` ya define:

- Build: `npm ci --include=dev && npm run build`.
- Start: `npm run db:migrate && node apps/api/dist/index.js`.
- Health check: `/health`.
- `NODE_ENV=development` para habilitar la consola dev del ledger y de clases.
- `HOST=0.0.0.0`.
- `DATABASE_URL` inyectada desde la base.
- Drivers de WhatsApp y email en `log`.

## Verificar

Cuando el deploy termine:

```text
https://TU-SERVICIO.onrender.com/health
# {"status":"ok"}

https://TU-SERVICIO.onrender.com/
```

En la consola, pestaña **Créditos**:

1. Crear un estudiante.
2. Crear un plan.
3. Comprar un paquete.
4. Ajustar créditos con un motivo.
5. Ver el historial y el saldo.

En la pestaña **Clases**:

1. Usar **Agregar instructoras demo** si la base está vacía.
2. Crear una plantilla semanal.
3. Generar las sesiones de las próximas cuatro semanas.
4. Editar el cupo de una sesión.
5. Abrir la cancelación de una clase para ver el aviso de devoluciones y avisos en cola.

El acceso directo a la agenda es `https://TU-SERVICIO.onrender.com/#clases`.

## Limitaciones de la demo

- El web service free **duerme a los 15 minutos** sin tráfico. La primera visita puede tardar cerca de un minuto.
- El PostgreSQL free **expira a los 30 días**. Para unos días de evaluación alcanza.
- No hay autenticación: cualquiera con la URL puede escribir. Usar solo datos de demo.
- La app actual es la consola de desarrollo con ledger, horarios y cancelación de clase; el portal del alumnado, las reservas completas y el panel con roles todavía no están implementados.
- Los avisos de cancelación quedan en la tabla `notifications`; el worker que los envía no está implementado.
- Render free no permite SMTP en los puertos habituales; `EMAIL_DRIVER=log` evita ese problema. WhatsApp usa el driver de log.

## Si el deploy falla

- **502 / timeout:** revisar que el servicio escuche en `0.0.0.0` y que el build haya generado `apps/web/dist`.
- **Error de migración:** ver los logs del servicio y confirmar que `DATABASE_URL` esté inyectada y que la base esté disponible. Volver a deployar.
- **La UI carga pero los datos fallan:** revisar `/api/dev/ledger/overview` y `/api/dev/scheduling/overview`, y los logs de la API.
- **Cold start:** esperar y recargar; es el comportamiento del plan free.

## Alternativa

Si Render pide tarjeta o no querés cold starts, Northflank Sandbox permite 2 servicios always-on, 1 base y 2 jobs sin tarjeta según su pricing. La base puede seguir siendo PostgreSQL.
