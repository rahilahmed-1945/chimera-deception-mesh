import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env.js';
import * as schema from './schema.js';

// Lazily-connecting postgres client (no connection is opened until first query).
const queryClient = postgres(env.DATABASE_URL);

export const db = drizzle(queryClient, { schema });
export { schema };

// Re-export the query operators so scripts in non-package folders (e.g.
// infra/seed) can use them without resolving `drizzle-orm` on their own.
export { eq, sql } from 'drizzle-orm';
