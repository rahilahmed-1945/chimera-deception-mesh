import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
// Reuse the single source-of-truth schema (pure table defs, no env coupling).
import * as schema from '../../api/src/db/schema.js';

const url = process.env.DATABASE_URL ?? 'postgres://chimera:chimera@localhost:5432/chimera';
const client = postgres(url);

export const db = drizzle(client, { schema });
export const { attackers, decoys, events, threatIntel } = schema;
