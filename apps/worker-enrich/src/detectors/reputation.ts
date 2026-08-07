import { sql } from 'drizzle-orm';
import { db, threatIntel } from '../db.js';

/**
 * Look up an IP's reputation category from the static threat_intel list via
 * CIDR containment (ip <<= indicator). Returns null when there is no match.
 */
export async function lookupReputation(ip: string): Promise<string | null> {
  const [row] = await db
    .select({ category: threatIntel.category })
    .from(threatIntel)
    .where(sql`${ip}::inet <<= ${threatIntel.indicator}`)
    .limit(1);
  return row?.category ?? null;
}
