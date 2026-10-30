import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional(),
);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().url(),
    TEST_DATABASE_URL: optionalUrl,
    APP_TIMEZONE: z.string().default('America/Argentina/Buenos_Aires'),
    APP_ORIGIN: z.string().url().default('http://localhost:5173'),
    OFFER_WINDOW_MINUTES: z.coerce.number().int().positive().default(120),
    STUDENT_SESSION_DAYS: z.coerce.number().int().positive().default(90),
    AUTH_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(10),
    AUTH_CODE_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    AUTH_CODE_REQUESTS_PER_HOUR: z.coerce.number().int().positive().default(3),
    STAFF_SESSION_HOURS: z.coerce.number().int().positive().default(12),
    WHATSAPP_DRIVER: z.enum(['log', 'meta']).default('log'),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    EMAIL_DRIVER: z.enum(['log', 'smtp']).default('log'),
    SMTP_URL: optionalUrl,
    COOKIE_SECURE: booleanString,
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    OUTBOX_POLL_MS: z.coerce.number().int().positive().default(2000),
  })
  .superRefine((value, ctx) => {
    if (
      value.WHATSAPP_DRIVER === 'meta' &&
      (!value.WHATSAPP_PHONE_NUMBER_ID || !value.WHATSAPP_ACCESS_TOKEN)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WHATSAPP_PHONE_NUMBER_ID'],
        message:
          'WHATSAPP_PHONE_NUMBER_ID y WHATSAPP_ACCESS_TOKEN son obligatorios con WHATSAPP_DRIVER=meta',
      });
    }

    if (value.EMAIL_DRIVER === 'smtp' && !value.SMTP_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_URL'],
        message: 'SMTP_URL es obligatorio con EMAIL_DRIVER=smtp',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}

export const DEFAULT_DEV_DATABASE_URL =
  'postgresql://estudio_yoga:estudio_yoga_dev@127.0.0.1:5432/estudio_yoga';

export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://estudio_yoga:estudio_yoga_dev@127.0.0.1:5432/estudio_yoga_test';
