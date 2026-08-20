import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.string().default('info'),
  SUPER_ADMIN_EMAIL: z.string().email().default('admin@sendwhats.local'),
  SUPER_ADMIN_PASSWORD: z.string().default('ChangeMe123!'),
  EVOLUTION_API_URL: z.string().default('http://localhost:8080'),
  EVOLUTION_API_KEY: z.string().default(''),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  SEND_MIN_DELAY_MS: z.coerce.number().default(6000),
  SEND_MAX_DELAY_MS: z.coerce.number().default(20000),
  SEND_MAX_PER_MINUTE: z.coerce.number().default(6),
  SEND_MAX_PER_DAY: z.coerce.number().default(500),
  SEND_BATCH_SIZE: z.coerce.number().default(50),
  SEND_BATCH_COOLDOWN_MS: z.coerce.number().default(300000),
  /** How many times a send is retried before the message is marked failed. */
  SEND_MAX_ATTEMPTS: z.coerce.number().default(3),
  /** Worker concurrency across all instances; per-instance pacing is enforced separately. */
  WORKER_CONCURRENCY: z.coerce.number().default(5),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
