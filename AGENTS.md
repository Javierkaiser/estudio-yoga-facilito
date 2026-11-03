# AGENTS.md

Sistema de gestión para un estudio de yoga. Monorepo npm workspaces, Node.js 22, TypeScript ESM y PostgreSQL 16. La UI y los artefactos de OpenSpec están en español rioplatense.

## Estado actual

- Change activo: `openspec/changes/gestion-estudio-yoga` (schema `spec-driven`). Al escribir esto: **25/61 tareas** completas.
- Implementado: monorepo, esquema/migraciones/triggers, ledger de créditos, staff CLI, horarios/sesiones/cancelación de clase y consola visual de desarrollo con las vistas Créditos y Clases.
- **No implementado todavía**: reservas/lista de espera/ofertas completas, auth, portal del alumnado, panel de staff y outbox de WhatsApp. Las tablas base existen, pero faltan los servicios y endpoints. El worker es un stub.
- Antes de asumir una capacidad, revisar `openspec status --change gestion-estudio-yoga --json` y `openspec instructions apply --change gestion-estudio-yoga --json`. Las specs describen el objetivo, no necesariamente lo ya construido.

## Comandos

```bash
cp .env.example .env          # .env está ignorado
podman compose up -d db       # PostgreSQL 16; contenedor estudio-yoga-db
npm install
npm run db:migrate            # aplica migraciones SQL pendientes
npm run dev:api               # API en 127.0.0.1:3000
npm run dev:web               # consola en 127.0.0.1:5173, proxy /api -> 3000
npm run dev:worker            # stub, sin jobs reales todavía
npm run typecheck
npm run lint
npm test
npm run build                 # typecheck + tsup API/worker + Vite web
npm run staff:create -- --email <email> --name <nombre> --role admin|instructor
```

- Un solo archivo de test: `npm test -- tests/ledger/ledger.test.ts`.
- Para inspeccionar la base de test: `KEEP_TEST_DB=1 npm test -- tests/acceptance/ledger-invariant.test.ts`; la próxima corrida la vuelve a borrar.
- No hay CI ni pre-commit: la verificación es local. Prettier no corre dentro de `lint`; usar `npm run format` si se tocaron muchos archivos.
- La API solo expone `/health` y `/api/dev/ledger/*`. Las rutas dev se registran si `NODE_ENV !== 'production'` y no tienen autenticación.

## Arquitectura

- `apps/api`: Fastify. `buildServer(pool, { enableDevRoutes })` en `apps/api/src/server.ts`; rutas dev en `dev-ledger.ts`. `index.ts` es el entrypoint.
- `apps/web`: React/Vite. `App.tsx` es la consola; componentes en `src/components`; CSS custom en `src/styles.css`.
- `apps/worker`: loop vacío. No hay scheduler de outbox ni vencimientos todavía.
- `packages/core`: dominio y servicios. `ledger.ts` es el único módulo de aplicación que consulta o escribe créditos; el ledger, `students.ts` y `staff.ts` son módulos separados.
- `packages/db`: pool `pg`, runner de migraciones y `schema.ts` Drizzle. **Drizzle es solo un espejo tipado**: en runtime se usa `pg` y SQL explícito.
- `packages/shared`: env Zod y utilidades de fecha en `America/Argentina/Buenos_Aires`.
- `packages/testing`: harness de PostgreSQL y factories.
- Los imports entre paquetes son relativos; no hay path aliases configurados.

## Ledger: reglas no negociables

- El saldo vive en `student_packages.balance` pero lo mantiene un trigger al insertar `credit_movements`. Nunca hacer `UPDATE ... SET balance = ...` directo.
- `credit_movements` es append-only: un trigger bloquea `UPDATE` y `DELETE`. Un cambio de saldo es un movimiento nuevo.
- Solo `packages/core/src/ledger.ts` puede tocar `student_packages` / `credit_movements` en código de aplicación; `tests/architecture/ledger-writer.test.ts` falla si otro módulo de `apps` o `packages/core` lo hace.
- Consumo FEFO, devolución al paquete de origen, vencimiento y rechazo de saldo negativo están implementados en el ledger. Reutilizar esas funciones; no duplicar SQL de créditos.
- `0001_init.sql` ya está aplicada en la base de desarrollo. Para cambiar el esquema, **agregar una migración nueva**; no editar una migración ya aplicada (el runner la salta por `schema_migrations`).
- No hay dinero: no agregar precios, importes, pagos ni facturación al modelo ni a la UI.

## Tests y base de datos

- La suite usa PostgreSQL real; no reemplazar por SQLite, `pg-mem` ni mocks. Los locks y triggers son parte del comportamiento.
- Por defecto usa `estudio_yoga_test` (`TEST_DATABASE_URL`). El harness la **elimina y recrea** en cada corrida: nunca apuntar `TEST_DATABASE_URL` a la base de desarrollo.
- `vitest.config.ts` corre en serie (`fileParallelism: false`), trunca tablas entre tests y bloquea `fetch`: no agregar llamadas de red a los tests.
- Si la base no está corriendo, el harness intenta `podman compose up -d db` o `docker compose`; la imagen `postgres:16-alpine` debe existir localmente, no la descarga.
- Los tests de aceptación del ledger están en `tests/acceptance/`; no debilitarlos para hacer pasar un cambio.
- Las compras y ajustes requieren un `StaffActor` admin activo. Las rutas dev crean `dev-admin@local` si no hay un admin; no hay login/sesión todavía.

## UI y marca

- Antes de tocar UI, leer `skills/estudio-yoga-brand/SKILL.md`. Es la fuente de verdad visual y verbal.
- El archivo fuente es `skills/estudio-yoga-brand/SKILL.md`; `.opencode/skills/estudio-yoga-brand` es un symlink local. `.opencode/` está ignorado por Git.
- Copy en español rioplatense; usar **alumnado** para el colectivo y **estudiante** para el singular. No usar “las alumnas” como genérico. Sin precios ni datos técnicos crudos en la UI.
- No introducir Tailwind ni otro sistema de diseño: la consola usa CSS custom y los tokens de `apps/web/src/styles.css`.
- La consola es de desarrollo, sin auth. No convertirla en el portal/panel final ni exponer las rutas dev.

## Gotchas del entorno

- API y Vite escuchan en `127.0.0.1`. Si usás el navegador de Playwright MCP, corre en un contenedor Podman: `localhost`/`127.0.0.1` desde ahí no es el host. Para una revisión visual usá el navegador del host (`xdg-open`), o temporalmente levantá Vite con `--host 0.0.0.0` y agregá `host.containers.internal` a `server.allowedHosts`; revertilo después.
- `.codegraph/` existe pero se indexó antes de que hubiera código (0 símbolos). No confiar en `codegraph_explore`; usar `rg`/lectura hasta que el índice se regenere.
- La carpeta `data/postgres/` es el bind mount de PostgreSQL y está ignorada por Git; no borrar `pgdata` sin querer resetear la base. La guía está en `docs/local-postgres.md`.
