# Chimera — Zerops deployment notes

Operational companion to [`zerops.yaml`](../zerops.yaml) (the five application
services) and [`infra/zerops-project-import.yml`](../infra/zerops-project-import.yml)
(the four managed backing services). This document records how production values
are supplied, plus the two items that need more than configuration: the applied
NATS auth code fix and the optional SSH host-key mount.

## Services

| Kind    | Service                            | Public?                          | Provisioned by |
| ------- | ---------------------------------- | -------------------------------- | -------------- |
| App     | `web` (static SPA)                 | Public HTTP                      | `zerops.yaml`  |
| App     | `api` (Fastify REST + WS)          | Public HTTP `:3000`              | `zerops.yaml`  |
| App     | `worker-enrich`                    | Private (no port)                | `zerops.yaml`  |
| App     | `decoy-http`                       | Public HTTP `:8080`              | `zerops.yaml`  |
| App     | `decoy-ssh`                        | Public raw TCP `:2222`           | `zerops.yaml`  |
| Managed | `db` — PostgreSQL 16               | Private                          | import YAML    |
| Managed | `nats` — NATS 2.10                 | Private                          | import YAML    |
| Managed | `valkey` — Valkey 7.2              | Private                          | import YAML    |
| Managed | `storage` — object storage (MinIO) | Endpoint public (presigned URLs) | import YAML    |

## Environment variables — source of each production value

All variable **names** are verified against the source (`grep process.env` /
`import.meta.env`). "Auto" = injected by Zerops from a managed service; "Manual"
= you set it in the Zerops GUI.

| Variable                             | Consumed by (source)                                       | Production value                                    | Auto / Manual           |
| ------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------- | ----------------------- |
| `DATABASE_URL`                       | api `db/client.ts`, worker `db.ts`                         | `${db_connectionString}`                            | **Auto**                |
| `NATS_URL`                           | api `events.ts`, worker `index.ts`, both decoys `index.ts` | `${nats_connectionString}`                          | **Auto**                |
| `VALKEY_URL`                         | api `cache.ts` (optional)                                  | `${valkey_connectionString}`                        | **Auto**                |
| `S3_ENDPOINT`                        | api + worker `storage.ts`                                  | `${storage_apiUrl}`                                 | **Auto**                |
| `S3_BUCKET`                          | api + worker `storage.ts`                                  | `${storage_bucketName}`                             | **Auto**                |
| `S3_ACCESS_KEY`                      | api + worker `storage.ts`                                  | `${storage_accessKeyId}`                            | **Auto**                |
| `S3_SECRET_KEY`                      | api + worker `storage.ts`                                  | `${storage_secretAccessKey}`                        | **Auto**                |
| `PORT`                               | api `index.ts`                                             | `'3000'` (in `zerops.yaml`)                         | Auto (static)           |
| `NODE_ENV`                           | api `env.ts`                                               | `production` (in `zerops.yaml`)                     | Auto (static)           |
| `DECOY_SSH_PORT` / `DECOY_HTTP_PORT` | decoys                                                     | `'2222'` / `'8080'` (in `zerops.yaml`)              | Auto (static)           |
| `JWT_SECRET`                         | api `services/auth.ts`                                     | **secret** — set on the `api` service               | **Manual (secret)**     |
| `VITE_API_URL`                       | web `api.ts`, `ws.ts` (build-time)                         | the api's public URL, set on `web` **before build** | **Manual (build-time)** |
| `DECOY_ID` / `DECOY_HTTP_ID`         | decoys, seeds                                              | default in code = seeded ids (`…d1` / `…d2`)        | Not set (code default)  |
| `DEMO_TENANT_ID`                     | api `routes/decoys.ts`, seeds                              | default in code = seeded tenant (`…a1`)             | Not set (code default)  |
| `SSH_HOST_KEY_PATH`                  | decoy-ssh `hostkey.ts`                                     | optional — see "SSH host key" below                 | Not set (optional)      |

**No credentials are hardcoded.** Every secret-bearing value is either a Zerops
`${…}` reference (auto-injected) or an externally supplied secret (`JWT_SECRET`).

### Values that must be configured manually in Zerops

1. **`JWT_SECRET`** — a strong secret on the `api` service (type: secret). Never
   the `.env.example` placeholder.
2. **`VITE_API_URL`** on the `web` service — set to the api's public subdomain
   **after** the api is deployed and has a URL, then (re)build `web`. It is a
   build-time constant baked into the static bundle; it deliberately is **not**
   hardcoded in the repo because the api URL does not exist until first deploy.
3. **Dedicated IPv4 + public TCP `2222`** for `decoy-ssh` (GUI) — only if you
   want the honeypot to receive real internet attacker traffic (see below).

### Values Zerops provides automatically

`DATABASE_URL`, `NATS_URL`, `VALKEY_URL`, `S3_ENDPOINT`, `S3_BUCKET`,
`S3_ACCESS_KEY`, `S3_SECRET_KEY` — all resolved from the managed services by the
`${…}` references in `zerops.yaml`, provided the managed services use the exact
hostnames `db`, `nats`, `valkey`, `storage`.

## Application change required for Zerops (APPLIED)

### 1. NATS authentication

Zerops NATS **requires authentication**; `${nats_connectionString}` is
`nats://user:pass@host:4222`. The NATS JS client (`nats@2.29.3`) **does not read
credentials from the server URL** — `hostPort()` strips the userinfo and the
CONNECT auth is built only from explicit `user`/`pass`/`token` options. So a
credentialed URL alone would connect **unauthenticated** and be rejected.

Fix applied in [`packages/transport/src/index.ts`](../packages/transport/src/index.ts)
→ `connectNats()`: it parses the URL and lifts any `user:pass` into explicit
`user`/`pass` options (URL-decoded), using the credential-free `protocol//host`
as `servers`. A URL **without** credentials is left untouched, so local dev
(`nats://localhost:4222`) stays unauthenticated — behavior verified by build and
a live connect against the local no-auth broker.

All four NATS consumers — `api`, `worker-enrich`, `decoy-ssh`, `decoy-http`
(plus the `demo:replay` tool) — go through this single `connectNats`, so no
per-service change was needed. This is a transport-connection change only: it
does not touch event semantics, subjects, schemas, the WebSocket, decoy
behavior, transcripts, or demo replay.

### 2. SSH host-key persistence (optional, cosmetic)

`decoy-ssh` generates an ed25519 host key on first run and writes it to
`apps/decoys/ssh/.hostkey/` (gitignored). Zerops runtime filesystems are
replaced on each redeploy, so the key regenerates per deploy. The code already
supports an override: `SSH_HOST_KEY_PATH` ([`hostkey.ts`](../apps/decoys/ssh/src/hostkey.ts)).

For a honeypot this is **cosmetic** — a changing host key only produces the
client-side "host key changed" warning that real attackers ignore; capture,
events, and transcripts are unaffected. If a stable identity is desired:

1. Provision a **Zerops Shared Storage** service and mount it into `decoy-ssh`.
2. Set `SSH_HOST_KEY_PATH` to a file under the mount (e.g.
   `/mnt/hostkey/ssh_host_ed25519_key`).

The shared-storage **mount** is configured on the service (Zerops GUI / verified
import descriptor); it is intentionally **not** added to `zerops.yaml` here
because the exact mount syntax was not verified in this pass, and inventing
unverified YAML is worse than documenting the approach.

## Deployment order

1. Push the milestone commit so the public repo matches the deployed state.
2. Provision managed services:
   `zcli project project-import infra/zerops-project-import.yml`
   (or `service-import` into an existing project) → creates `db`, `nats`,
   `valkey`, `storage`.
3. Apply the **NATS auth** transport change (blocker #1 above).
4. Deploy the app services from `zerops.yaml` (GitHub integration or
   `zcli push`): `api`, `web`, `decoy-ssh`, `decoy-http`, `worker-enrich`.
5. Set `JWT_SECRET` (secret) on `api`. The api `initCommands` run
   `db:migrate` + seeds automatically once `DATABASE_URL` resolves.
6. Read the api's public URL → set `VITE_API_URL` on `web` → redeploy `web`.
7. (Optional) buy a dedicated IPv4 and enable public raw TCP `2222` on
   `decoy-ssh` for live attacker traffic; otherwise demo via `pnpm demo:replay`.
8. Verify: `GET /healthz`, dashboard loads, WS `/ws` connects, an event flows
   end-to-end, a transcript opens (proves object storage + presigned URL), and
   `/stats` is served (Valkey path).
