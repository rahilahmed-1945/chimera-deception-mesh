import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load the repo-root .env regardless of the process cwd (pnpm runs scripts with
// cwd = package dir). In production (Zerops) the vars are already in the
// environment, so the missing .env file is a harmless no-op.
const here = dirname(fileURLToPath(import.meta.url)); // apps/api/src
config({ path: resolve(here, '../../../.env') });

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NATS_URL: z.string().url(),
  // Optional: enables the short-lived /stats cache. Absent => cache disabled,
  // /stats reads Postgres directly (still the single source of truth).
  VALKEY_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.string().default('development'),
});

export const env = envSchema.parse(process.env);
