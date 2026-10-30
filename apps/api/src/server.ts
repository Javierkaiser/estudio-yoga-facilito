import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { ZodError } from 'zod';
import { DomainError } from '../../../packages/core/src/errors';
import { registerDevLedgerRoutes } from './dev-ledger';

export interface ServerOptions {
  enableDevRoutes?: boolean;
}

export function buildServer(pool: Pool, options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'ok' }));

  if (options.enableDevRoutes !== false) {
    registerDevLedgerRoutes(app, pool);
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
