import { db } from '../../apps/api/src/db/client.js';
import { decoyTemplates } from '../../apps/api/src/db/schema.js';

// The Phase 1 decoy catalog. Seeding both templates is the catalog itself; the
// deploy modal (M6) reads from it. Idempotent via ON CONFLICT (key).
const templates = [
  {
    key: 'ssh',
    name: 'SSH Honeypot',
    protocol: 'ssh',
    defaultPort: 2222,
    description: 'Emulated OpenSSH server that captures credentials and typed commands.',
  },
  {
    key: 'http',
    name: 'HTTP Admin Panel',
    protocol: 'http',
    defaultPort: 8080,
    description: 'Fake admin login/API that captures requests, paths, and payloads.',
  },
];

async function main() {
  for (const template of templates) {
    await db.insert(decoyTemplates).values(template).onConflictDoNothing({
      target: decoyTemplates.key,
    });
  }
  console.log(`Seeded ${templates.length} decoy templates.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
