import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const optionalEnvString = z.string().optional().transform((value) => value?.trim() ?? '');

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // WhatsApp
  WHATSAPP_PROVIDER: z.enum(['meta', 'bridge']).default('meta'),
  WHATSAPP_VERIFY_TOKEN: optionalEnvString,
  WHATSAPP_API_TOKEN: optionalEnvString,
  WHATSAPP_PHONE_NUMBER_ID: optionalEnvString,
  WHATSAPP_APP_SECRET: optionalEnvString,
  WHATSAPP_BOT_NAME: z.string().default('VolaBot'),
  WHATSAPP_BRIDGE_URL: z.string().url().default('http://localhost:3001'),

  // OpenAI

  OPENAI_API_KEY: z.string().min(1),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_VISION_MODEL: z.string().default('gpt-4o'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Postgres
  DATABASE_URL: z.string().min(1),

  // Vola
  VOLA_BASE_URL: z.string().default('https://www.vola.ro'),
  VOLA_SEARCH_CACHE_TTL: z.coerce.number().default(300),

  // Sentry
  SENTRY_DSN: z.string().optional(),
}).superRefine((env, ctx) => {
  if (env.WHATSAPP_PROVIDER !== 'meta') return;

  for (const key of ['WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_API_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET'] as const) {
    if (env[key]) continue;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [key],
      message: `${key} is required when WHATSAPP_PROVIDER=meta`,
    });
  }
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  cachedEnv = result.data;
  return cachedEnv;
}
