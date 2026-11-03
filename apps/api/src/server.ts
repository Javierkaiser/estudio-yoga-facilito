import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Pool } from 'pg';
import { ZodError } from 'zod';
import { DomainError } from '../../../packages/core/src/errors';
import { registerDevLedgerRoutes } from './dev-ledger';
import { registerDevSchedulingRoutes } from './dev-scheduling';

export interface ServerOptions {
  enableDevRoutes?: boolean;
  serveWeb?: boolean;
}

export function buildServer(pool: Pool, options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'ok' }));

  if (options.enableDevRoutes !== false) {
    registerDevLedgerRoutes(app, pool);
    registerDevSchedulingRoutes(app, pool);
  }

  const webRoot = resolve(process.cwd(), 'apps/web/dist');
  if (options.serveWeb !== false && existsSync(webRoot)) {
    app.register(fastifyStatic, {
      root: webRoot,
      prefix: '/',
    });

    app.setNotFoundHandler((request, reply) => {
      const wantsHtml = request.headers.accept?.includes('text/html') ?? false;
      if (
        request.method === 'GET' &&
        wantsHtml &&
        !request.url.startsWith('/api') &&
        request.url !== '/health'
      ) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ code: 'NOT_FOUND', message: 'Ruta no encontrada' });
    });
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) {
      return reply.status(error.status).send({ code: error.code, message: error.message });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: error.issues[0]?.message ?? 'Datos inválidos',
      });
    }

    console.error(error);
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado',
    });
  });

  return app;
}
