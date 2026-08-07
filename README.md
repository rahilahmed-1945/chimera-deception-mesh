# Chimera

**Self-Serve Deception Mesh** — deploy decoy services, watch attackers reveal themselves in real time, and turn raw hits into threat intelligence.

Built for the **Zerops Challenge 2026**.

> Status: **M0 — skeleton**. Monorepo scaffold only; the event spine, decoys, map, and enrichment land in later milestones.

**Live URL:** _(added at first deploy — M4)_

---

## Architecture (Phase 1)

Isolated decoys on a private VLAN publish one-way events to NATS; the `api` control plane persists them to Postgres and fans them out over WebSocket to the `web` dashboard, while an autoscaling `worker-enrich` turns each hit into a map pin + technique badge.

| Service                                     | Role                                                   |
| ------------------------------------------- | ------------------------------------------------------ |
| `api` (Fastify)                             | Control plane: auth, decoy lifecycle, REST + WebSocket |
| `web` (SvelteKit, static)                   | Dashboard: live map, event feed, intel                 |
| `decoy-ssh` (ssh2)                          | Hero SSH honeypot                                      |
| `decoy-http`                                | Fake admin-panel decoy                                 |
| `worker-enrich`                             | GeoIP + reputation + MITRE mapping; scales to zero     |
| PostgreSQL · Valkey · NATS · Object storage | Managed data + messaging spine                         |

## How Zerops is used

_(expanded before submission — M8)_ Multi-service project on the free Lightweight core: private-VLAN isolation between decoys and the data plane, autoscaling worker, managed Postgres/Valkey/NATS/object-storage, all deployed from `zerops.yaml`.

## Local development

Requires Node 22, pnpm, and Docker.

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # Postgres + Valkey + NATS + MinIO
cp .env.example .env
pnpm --filter @chimera/api dev                    # http://localhost:3000/healthz
pnpm --filter @chimera/web dev                    # http://localhost:5173
```

## AI tools disclosure

Built with assistance from Claude (Anthropic). _(finalized before submission.)_

## License

MIT — see [LICENSE](./LICENSE).
