import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Drizzle Kit reads the schema from the api service and writes SQL migrations
// into infra/migrations (the folder reserved for them in the repo layout).
export default defineConfig({
  schema: './apps/api/src/db/schema.ts',
  out: './infra/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
