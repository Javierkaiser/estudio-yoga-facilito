# Estudio de Yoga

Sistema de gestión para el estudio: saldo de clases auditable, cupo con lista de espera, portal del alumnado y panel de staff.

El proyecto está en implementación incremental. Esta etapa cubre el esqueleto del monorepo, el esquema de base de datos, el ledger de créditos, los horarios con generación de sesiones y cancelación de clase, y una consola local para operarlos visualmente. La planificación completa está en [`openspec/changes/gestion-estudio-yoga/`](openspec/changes/gestion-estudio-yoga/).

## Stack

- Node.js 22 + TypeScript estricto, npm workspaces.
- PostgreSQL 16 con Podman o Docker.
- Fastify para la API, React + Vite para la web.
- Vitest sobre PostgreSQL real.
- Sin dinero, sin pasarelas de pago y sin credenciales externas para correr los tests.

## Prerrequisitos

- Node.js 22 y npm 10 o superior.
- Podman con `podman compose` o Docker con `docker compose`.
- La imagen `postgres:16-alpine`. La primera vez se descarga; después el entorno funciona sin red.

## Puesta en marcha

```bash
cp .env.example .env
podman compose up -d db
npm install
npm run db:migrate
```

El `.env` local está ignorado por Git. Los valores por defecto del compose son:

```text
postgresql://estudio_yoga:estudio_yoga_dev@127.0.0.1:5432/estudio_yoga
```

La guía completa de la base está en [`docs/local-postgres.md`](docs/local-postgres.md).

## Desarrollo

```bash
npm run dev:api      # API en http://localhost:3000
npm run dev:worker   # worker de procesos periódicos
npm run dev:web      # consola visual en http://localhost:5173
```

Verificar la API:

```bash
curl http://127.0.0.1:3000/health
# {"status":"ok"}
```

## Consola visual del ledger

Con `npm run dev:api` y `npm run dev:web` abiertos, entrá a:

```text
http://localhost:5173
```

La consola permite:

- Crear estudiantes con teléfono E.164, email opcional y consentimiento de WhatsApp.
- Crear planes con créditos y vigencia.
- Registrar compras de paquetes.
- Ver el saldo vigente y los paquetes de cada estudiante.
- Ajustar créditos con motivo y ver el movimiento en el historial.
- Procesar vencimientos de paquetes.
- Recorrer el historial append-only de cada estudiante.

Es una consola **de desarrollo**, sin autenticación. Las rutas `/api/dev/ledger/*` solo se registran cuando `NODE_ENV` no es `production`. El portal del alumnado y el panel de staff con roles siguen pendientes en el grupo 8.

## Consola de clases

La pestaña **Clases** de la misma consola permite:

- Agregar instructoras demo en una base nueva.
- Crear y editar plantillas semanales con día, hora local, duración, cupo e instructora.
- Generar sesiones por rango de fechas sin duplicar las existentes.
- Ver la agenda con ocupación, lugares disponibles y lista de espera.
- Editar el cupo o la instructora de una sesión futura.
- Cancelar una clase y ver cuántas devoluciones y avisos en cola generó.

Las horas se editan y se muestran en `America/Argentina/Buenos_Aires`, pero se guardan en UTC. La guía completa está en [`docs/scheduling.md`](docs/scheduling.md). Los avisos quedan pendientes en la base: el worker de WhatsApp todavía no envía nada.

## Tests

La suite usa una base separada, `estudio_yoga_test`, que se crea desde cero y se elimina al terminar. Si el contenedor de PostgreSQL no está corriendo, el harness intenta levantarlo con `podman compose` o `docker compose`; la imagen debe estar disponible localmente.

> Si definís `TEST_DATABASE_URL`, apuntá a una base exclusiva de tests: el harness la elimina y la recrea en cada corrida. No uses la base de desarrollo.

```bash
npm test
```

Comandos puntuales:

```bash
npm test -- tests/ledger
npm test -- tests/acceptance/ledger-invariant.test.ts
npm test -- tests/acceptance/ledger-append-only.test.ts
npm test -- tests/db/triggers.test.ts
npm test -- tests/db/constraints.test.ts
npm test -- tests/config/env.test.ts
npm test -- tests/scheduling
npm test -- tests/acceptance/class-cancellation.test.ts
```

La suite bloquea `fetch` para garantizar que no haya llamadas de red. No usa Meta, SMTP ni WhatsApp.

## Base de datos

- Migraciones: `npm run db:migrate`.
- Runner idempotente: registra cada archivo en `schema_migrations`.
- Esquema y garantías: [`docs/data-model.md`](docs/data-model.md).
- Reglas del ledger: [`docs/ledger.md`](docs/ledger.md).

## Staff

Crear una cuenta de administradora o instructora:

```bash
npm run staff:create -- \
  --email andrea@example.com \
  --name Andrea \
  --role admin \
  --password 'una-clave-segura'
```

Si se omite `--password`, el CLI la pide de forma interactiva. Para desactivar una cuenta:

```bash
npm run staff:create -- --deactivate --email andrea@example.com
```

Las contraseñas se guardan con Argon2id. No hay auto-registro ni endpoint público de creación de staff.

## Build

```bash
npm run typecheck
npm run lint
npm run build
```

El build genera:

- `apps/api/dist/index.js`
- `apps/worker/dist/index.js`
- `apps/web/dist/`

## Estado por capacidad

| Capacidad                                         | Estado                                  |
| ------------------------------------------------- | --------------------------------------- |
| `credit-ledger`                                   | Implementada con tests                  |
| Esquema, migraciones y staff CLI                  | Implementados con tests                 |
| Consola visual local del ledger                   | Implementada (solo desarrollo)          |
| `class-scheduling`                                | Implementada con tests y consola visual |
| `booking-lifecycle`                               | Pendiente                               |
| `student-auth`, `student-portal`, `staff-console` | Pendientes                              |
| `whatsapp-notifications`                          | Pendiente                               |

## Deploy en Render

El repo incluye `render.yaml` para una demo con PostgreSQL free. La app se sirve desde la API (sin CORS ni dos hosts).

- Guía: [`docs/render.md`](docs/render.md)
- En Render: **New → Blueprint**, elegir el repo y aplicar.
- La demo usa `NODE_ENV=development` para habilitar la consola del ledger; no tiene autenticación.
- El PostgreSQL free de Render expira a los 30 días; el web service free duerme a los 15 minutos.

## Skills del proyecto

La skill de marca vive en [`skills/estudio-yoga-brand/SKILL.md`](skills/estudio-yoga-brand/SKILL.md), dentro del árbol del proyecto y fuera de las rutas ignoradas por Git. OpenCode la descubre a través de `.opencode/skills/estudio-yoga-brand`, un enlace simbólico local. Si clonás el proyecto, recreá el enlace:

```bash
mkdir -p .opencode/skills
ln -s ../../skills/estudio-yoga-brand .opencode/skills/estudio-yoga-brand
```

## Documentación

- [`docs/local-postgres.md`](docs/local-postgres.md)
- [`docs/data-model.md`](docs/data-model.md)
- [`docs/ledger.md`](docs/ledger.md)
- [`docs/scheduling.md`](docs/scheduling.md)
- [`openspec/changes/gestion-estudio-yoga/design.md`](openspec/changes/gestion-estudio-yoga/design.md)
