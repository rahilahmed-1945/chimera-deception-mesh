import { db } from '../../apps/api/src/db/client.js';
import { threatIntel } from '../../apps/api/src/db/schema.js';

// Deterministic public-IP reputation entries so the enrichment demo visibly
// shows reputation categories. 8.8.8.0/24 is geolocatable (US) and used in
// M5 testing to exercise geo + reputation together.
const entries = [
  { indicator: '8.8.8.0/24', category: 'scanner' },
  { indicator: '1.1.1.0/24', category: 'tor-exit' },
  { indicator: '45.155.205.0/24', category: 'botnet' },
  { indicator: '185.220.101.0/24', category: 'tor-exit' },
  { indicator: '193.34.0.0/16', category: 'malware' },
];

async function main() {
  for (const entry of entries) {
    await db.insert(threatIntel).values(entry).onConflictDoNothing({
      target: threatIntel.indicator,
    });
  }
  console.log(`Seeded ${entries.length} threat-intel entries.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
