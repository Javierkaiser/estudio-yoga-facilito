import 'dotenv/config';
import { loadEnv } from '../../../packages/shared/src/env';

const env = loadEnv();
let running = true;

const timer = setInterval(() => {
  if (!running) {
    return;
  }
  // El worker de outbox y vencimientos se conecta en el grupo 4.
}, env.OUTBOX_POLL_MS);

const shutdown = (): void => {
  running = false;
  clearInterval(timer);
  console.log('Worker detenido');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('Worker iniciado');
