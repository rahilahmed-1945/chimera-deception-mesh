import { db, eq } from '../../apps/api/src/db/client.js';
import { decoyTemplates, decoys, tenants } from '../../apps/api/src/db/schema.js';

// Fixed ids so the publisher can target the demo decoy without a lookup.
// DECOY_ID must match apps/decoys/ssh/src/publisher.ts.
const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID ?? '00000000-0000-0000-0000-0000000000a1';
const DEMO_DECOY_ID = process.env.DECOY_ID ?? '00000000-0000-0000-0000-0000000000d1';
const DEMO_HTTP_DECOY_ID = process.env.DECOY_HTTP_ID ?? '00000000-0000-0000-0000-0000000000d2';

async function main() {
  await db
    .insert(tenants)
    .values({ id: DEMO_TENANT_ID, name: 'Demo Tenant' })
    .onConflictDoNothing();

  const [ssh] = await db
    .select({ id: decoyTemplates.id })
    .from(decoyTemplates)
    .where(eq(decoyTemplates.key, 'ssh'))
    .limit(1);
  if (!ssh) {
    throw new Error('ssh template not found — run `pnpm db:seed` first.');
  }

  await db
    .insert(decoys)
    .values({
      id: DEMO_DECOY_ID,
      tenantId: DEMO_TENANT_ID,
      templateId: ssh.id,
      name: 'demo-ssh-decoy',
    })
    .onConflictDoNothing();

  const [http] = await db
    .select({ id: decoyTemplates.id })
    .from(decoyTemplates)
    .where(eq(decoyTemplates.key, 'http'))
    .limit(1);
  if (http) {
    await db
      .insert(decoys)
      .values({
        id: DEMO_HTTP_DECOY_ID,
        tenantId: DEMO_TENANT_ID,
        templateId: http.id,
        name: 'demo-http-decoy',
      })
      .onConflictDoNothing();
  }

  console.log(`Seeded demo tenant + ssh/http decoys (${DEMO_DECOY_ID}, ${DEMO_HTTP_DECOY_ID}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
