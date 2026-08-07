import type { DeceptionEventParsed } from '@chimera/shared';
import { and, eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import { attackers, db, decoys, events } from './db.js';
import { mapTechniques } from './detectors/mitre.js';
import { lookupReputation } from './detectors/reputation.js';
import { lookupGeo } from './geoip.js';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Retry an update that targets a row the API is inserting concurrently
 * (worker consumes the same subject as the ingest — see D1). Returns once a row
 * is affected, or gives up after a few short attempts.
 */
async function withRetry(fn: () => Promise<boolean>, log: Logger, label: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await fn()) return;
    await sleep(100);
  }
  log.warn({ label }, 'enrichment update matched no row after retries');
}

/** Enrich one deception event: geo + reputation on the attacker, MITRE on the event. */
export async function enrichEvent(event: DeceptionEventParsed, log: Logger): Promise<void> {
  const [decoy] = await db
    .select({ tenantId: decoys.tenantId })
    .from(decoys)
    .where(eq(decoys.id, event.decoyId))
    .limit(1);
  if (!decoy) {
    log.warn({ decoyId: event.decoyId }, 'unknown decoy; skipping enrichment');
    return;
  }

  const geo = lookupGeo(event.sourceIp);
  const reputation = await lookupReputation(event.sourceIp);

  const attackerSet = {
    ...(geo && {
      countryCode: geo.country,
      city: geo.city,
      latitude: geo.latitude,
      longitude: geo.longitude,
    }),
    ...(reputation && { reputation }),
  };

  if (Object.keys(attackerSet).length > 0) {
    await withRetry(
      async () => {
        const res = await db
          .update(attackers)
          .set(attackerSet)
          .where(and(eq(attackers.tenantId, decoy.tenantId), eq(attackers.ip, event.sourceIp)))
          .returning({ id: attackers.id });
        return res.length > 0;
      },
      log,
      'attacker',
    );
  }

  const techniques = mapTechniques(event.kind);
  if (techniques.length > 0) {
    await withRetry(
      async () => {
        const res = await db
          .update(events)
          .set({ techniques })
          .where(eq(events.id, event.id))
          .returning({ id: events.id });
        return res.length > 0;
      },
      log,
      'event',
    );
  }

  log.info(
    { ip: event.sourceIp, geo: geo?.country ?? null, reputation, techniques },
    'event enriched',
  );
}
