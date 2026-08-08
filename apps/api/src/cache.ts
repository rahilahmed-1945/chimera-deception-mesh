import Redis from 'ioredis';
import { env } from './env.js';

// Short-lived read-through cache for derived /stats counters. Valkey is a
// disposable accelerator, never a source of truth: every operation is guarded so
// that an unset, down, or slow Valkey transparently degrades to a Postgres read.

/** Cache key for the global /stats counters. Versioned (shape changes bump v1);
 *  the `all` scope reflects that /stats is currently global (no per-request
 *  tenant). Becomes `stats:v1:<tenantId>` once /stats is tenant-scoped. */
export const STATS_CACHE_KEY = 'stats:v1:all';

/** TTL for cached /stats, matched to the dashboard's 10s poll cadence. */
export const STATS_CACHE_TTL = 10;

// A single lazily-created client, or null when VALKEY_URL is unset (cache off).
const client: Redis | null = env.VALKEY_URL
  ? new Redis(env.VALKEY_URL, {
      // Fail fast instead of hanging /stats when Valkey is unreachable.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 500,
      commandTimeout: 200,
      // Keep trying to reconnect in the background, capped so we don't hammer.
      retryStrategy: (times) => Math.min(times * 200, 2000),
    })
  : null;

// Log connection trouble at most once per outage, so a Valkey outage can't spam
// the logs. Never throws — a missing cache must not affect request handling.
let loggedError = false;
if (client) {
  client.on('error', (err: Error) => {
    if (!loggedError) {
      loggedError = true;
      console.warn(`[cache] Valkey unavailable, /stats falling back to Postgres: ${err.message}`);
    }
  });
  client.on('ready', () => {
    loggedError = false;
  });
}

/** Read + parse a cached JSON value, or null on miss / any Valkey failure. */
export async function cacheGetJson<T>(key: string): Promise<T | null> {
  if (!client) return null;
  try {
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // treat any error as a miss -> caller reads Postgres
  }
}

/** Store a JSON value with a TTL (seconds). Best-effort; failures are swallowed. */
export async function cacheSetJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!client) return;
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Cache write is best-effort; Postgres already has the truth.
  }
}
