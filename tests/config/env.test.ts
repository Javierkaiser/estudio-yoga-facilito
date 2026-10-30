import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../packages/shared/src/env';

const databaseUrl = 'postgresql://user:pass@127.0.0.1:5432/test';

describe('configuración de entorno', () => {
  it('aplica los defaults seguros de desarrollo', () => {
    const env = loadEnv({ DATABASE_URL: databaseUrl });

    expect(env.NODE_ENV).toBe('development');
    expect(env.APP_TIMEZONE).toBe('America/Argentina/Buenos_Aires');
    expect(env.OFFER_WINDOW_MINUTES).toBe(120);
    expect(env.WHATSAPP_DRIVER).toBe('log');
    expect(env.EMAIL_DRIVER).toBe('log');
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it('exige DATABASE_URL', () => {
    expect(() => loadEnv({})).toThrow();
  });

  it('rechaza el driver de Meta sin credenciales', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: databaseUrl,
        WHATSAPP_DRIVER: 'meta',
      }),
    ).toThrow(/WHATSAPP_PHONE_NUMBER_ID/);
  });

  it('rechaza SMTP sin URL', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: databaseUrl,
        EMAIL_DRIVER: 'smtp',
        SMTP_URL: '',
      }),
    ).toThrow(/SMTP_URL/);
  });

  it('acepta URLs opcionales vacías', () => {
    const env = loadEnv({ DATABASE_URL: databaseUrl, SMTP_URL: '' });
    expect(env.SMTP_URL).toBeUndefined();
  });

  it('convierte COOKIE_SECURE=true', () => {
    const env = loadEnv({ DATABASE_URL: databaseUrl, COOKIE_SECURE: 'true' });
    expect(env.COOKIE_SECURE).toBe(true);
  });
});
