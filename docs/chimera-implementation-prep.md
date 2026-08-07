# Chimera — Master Implementation Preparation Guide

**For: switching into Claude Code and building Phase 1 end-to-end with minimal interruptions.**
**Hard budget: ~$14–15 Zerops promo credits, absolute max, never topped up. Must stay live through judging.**

This guide assumes nothing. Follow it top to bottom. By the end you can open Claude Code and build without stopping to figure out setup.

---

## Budget reality (read this first — it governs everything)

Verified Zerops pricing (per-minute billing, monthly-equivalent shown):

| Resource | Rate |
|---|---|
| Project core — **Lightweight** | **FREE** (15 build-hrs, 100 GB egress, 5 GB backups) |
| Project core — Serious | $10/mo ← **DO NOT enable this** |
| Shared CPU | $0.60 / core / month |
| RAM | $3.00 / GB / month |
| Disk | $0.10 / GB / month |
| Dedicated CPU | $6.00 / core / month ← never use for Chimera |
| Object storage | usage-based, effectively pennies at demo scale |

**The three rules that keep you under budget:**
1. **Stay on the free Lightweight core.** Never click upgrade to Serious. 15 build-hours ≈ hundreds of deploys — plenty.
2. **Use shared CPU + minimum RAM (0.25 GB) on every container.** Never dedicated CPU.
3. **Scale workers (and the optional second decoy) to zero when idle.** You pay per running minute; idle scaled-to-zero services cost ~nothing.

With those rules, the lean stack below costs roughly **$11–13/month if left running 24/7** — and you will NOT run it 24/7 for a month. Your real live window (build weekend + judging) is ~10–14 days ≈ **$4–6 total**, leaving comfortable margin. Watch the credit meter daily; that's your safety net.

---

## PART 1 — Credit-Aware Phase 1 Service Map

This is the reconciliation of the full blueprint (~11 services) down to the lean set that wins Phase 1 without wasting a cent. Each service earns its place or it's cut.

| # | Service | Purpose / why it exists | Mandatory? | Run mode | Resources | ~Credit impact | Postponable? |
|---|---|---|---|---|---|---|---|
| 1 | **api** (Node/Fastify) | Control plane: auth, decoy lifecycle, REST + WebSocket, publishes/consumes events. The brain. | **Yes** | Always on (holds WS) | 1 shared core, 0.25 GB, 1 GB disk | ~$1.45/mo | No |
| 2 | **web** (SvelteKit static) | The dashboard/map UI — the demo surface. | **Yes** | Always on (tiny) | 1 shared core, 0.25 GB | ~$1.45/mo (or **$0** if served as static from api) | No — but can merge into api to save a container |
| 3 | **decoy-ssh** (Node `ssh2`) | The hero honeypot; the live-attack wow depends on it. Must be listening. | **Yes** | Always on, tiny | 1 shared core, 0.25 GB | ~$1.45/mo | No |
| 4 | **decoy-http** (Node) | Second decoy → proves it's a *mesh*, not one trap. | Recommended | Always on OR scale-to-zero-ish | 1 shared core, 0.25 GB | ~$1.45/mo | **Yes** → Rung 3 |
| 5 | **worker-enrich** (Node) | GeoIP + ASN + reputation + MITRE mapping; writes transcript to storage, indexes results. | **Yes** | **Scale to zero** (min 0, max 2) | bursts only | ~$0 idle, pennies active | No |
| 6 | **PostgreSQL** (managed, non-HA) | System of record: decoys, events, attackers, users. Also full-text search (replaces Meilisearch in P1). | **Yes** | Always on | smallest non-HA | ~$2.5/mo | No |
| 7 | **Valkey** (managed, non-HA) | WebSocket fan-out + live map state + rate counters + cache. | **Yes** | Always on | smallest non-HA | ~$1.5/mo | No |
| 8 | **NATS** (managed, non-HA) | The one-way event spine: decoy → NATS → api/worker. The architectural centerpiece. | **Yes** | Always on | smallest non-HA | ~$1.5/mo | No |
| 9 | **Object storage** (S3) | Session transcripts + captured payloads. Keeps blobs out of Postgres; a distinct Zerops service to showcase. | **Yes** | Usage-based | few MB | ~$0.1–0.3/mo | No |
| — | ~~Meilisearch~~ | Search. **CUT from Phase 1** — Postgres full-text covers the demo search, saving an always-on container. | No | — | — | **saves ~$1.5/mo** | Add at Rung 3 only if margin is healthy |
| — | ~~scheduler~~ | Health checks + intel refresh. **CUT as a separate service** — fold into api as an interval loop (or Zerops scheduled job). | No | — | — | **saves a container** | Fold into api |

**Lean total (24/7, full month, worst case): ~$11–13.** Real judging-window cost: **~$4–6.** Comfortably inside $15.

**Why each surviving service deserves to exist (the judge-facing justification):**
- *api* — without it there is no control plane, no WS, no product.
- *web* — the map *is* the demo; but it's a static SvelteKit build, so it's near-free (and mergeable into api).
- *decoy-ssh* — the entire "attacker reveals themselves" wow originates here; it must be a real listening service.
- *decoy-http* — turns "a honeypot" into "a mesh," which is the product's identity; cheap, but postponable if time/credits tighten.
- *worker-enrich* — turns raw hits into intelligence (map pin + MITRE badge); scales to zero so it's free when nothing's attacking — itself a Zerops selling point you'll narrate.
- *Postgres / Valkey / NATS* — the managed data + messaging trio is the "real cloud-native architecture" judges want; each backs a distinct, demonstrable capability.
- *object storage* — the transcript in the event drawer comes from here; proves multi-service data flow.

**What you'll SAY to judges:** "Nine-ish services, every one load-bearing: isolated decoys on a private VLAN publish one-way to NATS, autoscaling workers enrich into Postgres and object storage, and the whole thing runs on the free project core for a few dollars." That sentence is the "built for Zerops" moment.

---

## PART 2 — Repository Setup

- **Create a new GitHub repo?** Yes. Fresh, dedicated.
- **Name:** `chimera` (or `chimera-deception-mesh` if `chimera` is taken).
- **Public or private?** **Public** — the hackathon *requires* a public repo. Create it public from day one (don't build private and flip later; you might forget, and the rules demand public).
- **License:** MIT (`LICENSE` file). Permissive, standard, expected for a hackathon/OSS submission.
- **README.md:** create immediately with a stub: project name, one-line pitch, live URL (fill later), architecture diagram, "how Zerops is used" section (judges read this), local-dev instructions, and the AI-tools disclosure. This doubles as your submission's front door — invest in it near the end.
- **.gitignore:** Node + env + build artifacts. Must include: `node_modules/`, `.env`, `.env.*`, `!.env.example`, `dist/`, `build/`, `.svelte-kit/`, `*.log`, `.DS_Store`, `/tmp`, `coverage/`, `.zerops/` (local zcli cache if any).
- **Branch strategy:** trunk-based. `main` is always deployable and always live. Work directly on `main` for a solo 48h build (feature branches add overhead you don't need). Tag a commit `submission` when you submit, so the judged state is frozen even if you keep hacking.
- **Environment variable structure:** commit a **`.env.example`** (documented, no secrets) at repo root and per-app. Real values live in a gitignored `.env` locally and in **Zerops secret env vars** in production. Never commit real secrets.

Initial commit checklist: `README.md`, `LICENSE`, `.gitignore`, `.env.example`, `pnpm-workspace.yaml`, folder skeleton (Part 5), and a `zerops.yaml` stub. Claude Code will generate all of this — see Part 10.

---

## PART 3 — Local Development Setup (install before writing code)

Install these on your machine **before** opening Claude Code so you're never blocked:

**Required:**
- **Node.js 22 LTS** — matches the `nodejs@22` Zerops base; use `nvm` to pin it (`nvm install 22 && nvm use 22`).
- **pnpm** (`npm i -g pnpm`) — monorepo workspace manager, fast, disk-efficient.
- **Git** — and be logged into GitHub (`gh` CLI optional but handy: `gh auth login`).
- **Docker + Docker Compose** — **required for local dev** so you run Postgres/Valkey/NATS locally instead of burning Zerops credits during development. This is a *budget* tool: develop against local containers, deploy the finished thing to Zerops.
- **zcli (Zerops CLI)** — `npm i -g @zerops/zcli` (or the documented install). This is how Claude Code deploys and streams logs. You'll authenticate it with an access token (Part 9).
- **A code editor** — VS Code (you'll run Claude Code alongside it).

**Recommended VS Code extensions:** ESLint, Prettier, Svelte for VS Code, Prisma/Drizzle syntax (if used), Docker, YAML, DotENV, Error Lens. None are strictly required to build, but they cut friction.

**Explicitly NOT needed (don't waste time installing):**
- **Python** — not used anywhere in Chimera (Palimpsest would need it; Chimera doesn't). Skip.
- **Go** — *only* if you keep decoys in Node (recommended). If you later want ultra-tiny Go decoy containers, install Go 1.23 then — but Phase 1 is all-TypeScript to keep one toolchain. Skip for now.
- **ZCP** — optional. You're developing locally with Claude Code + zcli, which is simpler and gives you full control. ZCP's cloud dev env is nice but not required; skipping it avoids extra moving parts. (Trade-off: ZCP gives a production-identical env; local docker-compose is close enough and free.)
- **MaxMind account** — avoided by using the `geoip-lite` package (bundled data, no signup). One fewer manual step.
- **Kubernetes / Terraform / any IaC** — Zerops replaces all of it. Skip.

---

## PART 4 — Zerops Preparation

- **New project or reuse?** **Create a brand-new project named `chimera`.** First, **go delete any test services/projects** you created while exploring — leftover running services silently drain credits. Start clean.
- **Project core:** **Lightweight (free).** Do not enable Serious.
- **Which services do YOU create manually vs Claude Code?**
  - **You (once, in the dashboard/CLI):** create the project; generate a **personal access token** for zcli; provision the **managed services** (PostgreSQL, Valkey, NATS, object storage) — easiest via a one-shot **service-import YAML** that Claude Code generates and you paste into the dashboard's "Import services," or add them from the service catalog. Enable **public access** on `web`, `api`, and the decoy ports. Set **secret env vars** (Part 7).
  - **Claude Code (via code + zcli):** writes all application code, the `zerops.yaml` build/run config for the runtime services (`api`, `web`, `decoy-ssh`, `decoy-http`, `worker-enrich`), runs migrations, and deploys with `zcli push`. It cannot click dashboard buttons or provision managed services for you — those are yours (Part 9).
- **How the project is organized:** one Zerops **project** = `chimera`, containing all services on one shared **private network**. Runtime services defined in `zerops.yaml`; managed services provisioned from catalog/import.
- **Networking:**
  - **Private by default:** every service talks to Postgres/Valkey/NATS/storage over the private VLAN by **hostname** (`db`, `valkey`, `nats`, `storage`) with **no public ports**.
  - **Public only where needed:** enable public HTTP on `web` and `api` (Zerops gives you a free `*.zerops.app`-style subdomain — **no DNS setup required**), and enable a **public TCP port** on each decoy (e.g., 2222 for SSH, 8080 for HTTP) so attackers can reach them. The private-VLAN firewall blocking decoy→data-plane is your isolation story.
- **Environment variables:** Zerops auto-injects managed-service connection strings (reference as `${db_connectionString}`, `${valkey_connectionString}`, etc. in `zerops.yaml`). App-level secrets (JWT secret, optional LLM key) are set as **secret env vars** in the dashboard. Locally, the same vars live in `.env`.
- **Custom domain?** **Not needed.** Use the free Zerops subdomain for the live URL. (Custom domain = optional polish, needs DNS; skip for the hackathon.)

---

## PART 5 — Folder Structure

Monorepo (pnpm workspaces). One language (TypeScript) across everything for a single toolchain.

```
chimera/
├─ README.md                     # pitch, live URL, architecture, "how Zerops is used", AI disclosure
├─ LICENSE                        # MIT
├─ .gitignore
├─ .env.example                  # documented env template (no secrets)
├─ pnpm-workspace.yaml           # declares apps/* and packages/* as workspaces
├─ package.json                  # root scripts (dev, build, lint), shared devDeps
├─ docker-compose.dev.yml        # LOCAL Postgres + Valkey + NATS + MinIO (S3) — saves Zerops credits
├─ zerops.yaml                   # build+run for all runtime services (api, web, decoys, worker)
├─ zerops-project-import.yaml    # one-shot service stack (managed + runtime shells) you import in dashboard
│
├─ apps/
│  ├─ web/                       # SvelteKit dashboard (map, feed, decoys, intel, auth)
│  │  ├─ src/routes/             # /, /login, /dashboard, /decoys, /intel, /settings
│  │  ├─ src/lib/components/     # Map, EventFeed, EventDrawer, KpiTile, Terminal, VerdictBadge
│  │  ├─ src/lib/ws/             # websocket client
│  │  └─ src/lib/api/            # typed calls to the api service
│  │
│  ├─ api/                       # Fastify control plane (REST + WebSocket)
│  │  ├─ src/routes/             # auth, decoys, events, search, stats
│  │  ├─ src/services/           # decoyProvisioner, eventIngest, authz, enrichPublisher
│  │  ├─ src/ws/                 # websocket server + valkey pub/sub fanout
│  │  ├─ src/db/                 # drizzle schema, migrations, client
│  │  └─ src/index.ts
│  │
│  ├─ worker-enrich/             # NATS/JetStream consumer: geoip, reputation, MITRE, storage, index
│  │  ├─ src/detectors/          # heuristic MITRE mapper, reputation
│  │  ├─ src/enrich.ts
│  │  └─ src/index.ts
│  │
│  └─ decoys/
│     ├─ ssh/                    # Node ssh2 honeypot → publishes events to NATS
│     └─ http/                   # fake admin panel trap → publishes events to NATS
│
├─ packages/
│  └─ shared/                    # shared TS types + the event schema (contract across services)
│     └─ src/                    # eventSchema.ts, zod validators, mitre map tables
│
└─ infra/
   ├─ migrations/                # SQL migrations (drizzle-generated)
   └─ seed/                      # demo seed + ambient-traffic script for the demo
```

**Why each folder exists:**
- `apps/*` — one deployable per Zerops runtime service; clean 1:1 mapping to `zerops.yaml`.
- `packages/shared` — the **event schema is the backbone** (decoy → NATS → api → worker all speak it); sharing it as one package prevents drift. This is the highest-value structural decision.
- `infra/` — migrations + the demo seed/ambient-traffic script (you'll want fake background events so the map isn't empty on stage).
- `docker-compose.dev.yml` — local infra so **development costs $0 in Zerops credits**; you only spend credits on the deployed product.
- `zerops-project-import.yaml` — lets you provision the whole managed stack in one dashboard action instead of clicking each service.

---

## PART 6 — Dependencies

Every dependency, why it's here, and nothing speculative. All TypeScript/Node unless noted.

**Root / tooling (devDependencies):**
- `typescript`, `tsx` (run TS directly in dev), `@types/node` — the language + runner.
- `eslint`, `prettier` — consistency; cheap insurance for a readable submission repo.
- `drizzle-kit` — generates SQL migrations from the schema.

**`packages/shared`:**
- `zod` — the event schema + all request validation. One source of truth for the wire contract.

**`apps/api` (control plane):**
- `fastify` — fast, lightweight HTTP server (lighter than Express, great TS support).
- `@fastify/websocket` — WebSocket endpoint for live map/feed push.
- `@fastify/cors` — browser ↔ api.
- `drizzle-orm` + `postgres` (the `postgres` driver) — DB access; Drizzle is lightweight and TS-first (smaller build than Prisma → faster deploys, fewer build-minutes → cheaper).
- `ioredis` — Valkey client (cache + pub/sub fan-out for multi-instance WebSocket).
- `nats` — NATS/JetStream client (publish/consume the event spine).
- `@aws-sdk/client-s3` — object storage (signed URLs, transcript upload/read).
- `jose` — JWT signing/verification (modern, no native build).
- `@node-rs/argon2` — password hashing (prebuilt binaries, no compile pain; fallback `bcryptjs` if any platform issue).
- `pino` — structured logging (Zerops aggregates it).

**`apps/worker-enrich`:**
- `nats`, `drizzle-orm`, `postgres`, `@aws-sdk/client-s3`, `ioredis`, `pino` — same infra clients.
- `geoip-lite` — **offline** GeoIP/ASN lookup with bundled data (no MaxMind account, no network calls — zero setup, zero cost).
- (optional, deferred) `@anthropic-ai/sdk` — LLM classification fallback. **Only if** you enable the AI badge; costs external API money (not Zerops credits) — keep heuristics as default.

**`apps/decoys/ssh`:**
- `ssh2` — implement an SSH **server** that emulates login, captures username/password attempts and every command typed, then publishes to NATS. This is the hero decoy.
- `nats`, `pino`.

**`apps/decoys/http`:**
- `fastify` (or raw `http`) — serve a convincing fake admin login/API, capture requests/paths/payloads/headers, publish to NATS.
- `nats`, `pino`.

**`apps/web` (SvelteKit frontend):**
- `svelte`, `@sveltejs/kit`, `vite` — the app framework; static-adapter build = near-free hosting.
- `@sveltejs/adapter-static` (or node adapter) — output a static site (cheapest to serve).
- `tailwindcss` — fast, sharp dark UI.
- **Map (pick one):** primary `maplibre-gl` — robust 2D dark world map with markers/arcs, reliable for a live demo. *Wow upgrade (optional):* `globe.gl` (three.js globe with arcs) — more spectacular, slightly more finicky; only swap in if the 2D version is solid and you have time.
- `xterm` — terminal-style session-transcript playback in the event drawer (the "watch what the attacker typed" moment).
- **Charts (optional, keep minimal):** `uplot` (tiny) for any sparkline/KPI trend, or just hand-rolled SVG/CSS for KPI tiles. Don't pull a heavy chart lib.

**Explicitly NOT included (avoid bloat):** Prisma (heavier than Drizzle), Express (Fastify chosen), Meilisearch client (using Postgres FTS in P1), Kafka (NATS chosen), any React/Next libs (Svelte chosen), MaxMind SDK (geoip-lite chosen).

---

## PART 7 — Secrets & Environment Variables

Legend: **[NOW]** needed to run locally from day one · **[LATER]** add when the feature lands.

**Managed-service connection strings (Zerops injects in prod; local values point at docker-compose):**
- `DATABASE_URL` **[NOW]** — Postgres connection (local: `postgres://chimera:chimera@localhost:5432/chimera`; prod: `${db_connectionString}`).
- `VALKEY_URL` **[NOW]** — Valkey/Redis (local: `redis://localhost:6379`; prod: `${valkey_connectionString}`).
- `NATS_URL` **[NOW]** — NATS (local: `nats://localhost:4222`; prod: `nats://nats:4222`).
- `S3_ENDPOINT` **[NOW]** — object storage endpoint (local MinIO: `http://localhost:9000`; prod: `${storage_apiUrl}`).
- `S3_BUCKET` **[NOW]** — bucket name (local: `chimera`; prod: `${storage_bucketName}`).
- `S3_ACCESS_KEY` / `S3_SECRET_KEY` **[NOW]** — storage creds (local MinIO defaults; prod: `${storage_accessKeyId}` / `${storage_secretAccessKey}`).

**App secrets:**
- `JWT_SECRET` **[NOW]** — signs auth tokens; a long random string. Set as a Zerops secret in prod; a throwaway value locally.
- `NODE_ENV` **[NOW]** — `development` / `production`.
- `PUBLIC_API_URL` **[NOW]** — the web app's target api URL (local `http://localhost:3000`; prod your api's Zerops subdomain).
- `DECOY_SSH_PORT` / `DECOY_HTTP_PORT` **[NOW]** — ports the decoys listen on.

**Deferred:**
- `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) **[LATER]** — only if you enable the LLM classification badge. ⚠️ Costs external money, not Zerops credits — keep spend tiny, cap it, and default to the free heuristic mapper.
- `REPUTATION_FEED_URL` **[LATER]** — real threat-intel feed; P1 uses a static bundled list.
- Slack/PagerDuty webhook secrets **[LATER]** — Phase 2 alerting, not Phase 1.

Everything **[NOW]** goes in `.env.example` (documented, empty) and your local `.env` (gitignored). The `git`-safe rule: real secret values only ever live in your local `.env` and in Zerops secret env vars — never in the repo.

---

## PART 8 — Development Order (milestones; each ends in a working state)

Mirrors the Rung ladder from the roadmap, broken into commit-sized steps. Build locally against docker-compose; deploy to Zerops at the checkpoints marked 🚀.

**M0 — Skeleton (working: empty apps run locally).** Monorepo scaffold, pnpm workspaces, `.env.example`, `docker-compose.dev.yml` up (Postgres/Valkey/NATS/MinIO), shared `eventSchema`, root scripts. `api` serves `/healthz`; `web` renders a blank dark shell.

**M1 — Auth + data layer (working: you can register/login; tables exist).** Drizzle schema (tenants, users, decoy_templates, decoys, events, attackers), migrations, JWT auth (register/login), protected route. Seed one decoy_template.

**M2 — The event spine (working: a fake event flows end-to-end).** `decoy-ssh` publishes a hardcoded test event to NATS → `api` consumes → persists to Postgres → pushes over WebSocket → `web` logs it. **This is the make-or-break backbone; do it before any UI polish.**

**M3 — Real SSH decoy (working: attacking the decoy creates a real event).** Implement `ssh2` server: capture creds + commands, publish real events. Attack it from your terminal locally and see the event land.

**M4 — Live map + feed + KPI tiles (working: attack → node flashes red live).** MapLibre dark map, node states, live feed, event detail drawer with the raw session, KPI tiles. **This is Rung 1 — the minimum winning demo.** 🚀 **First Zerops deploy here** so you validate prod early and have a live URL.

**M5 — Enrichment worker (working: events get GeoIP + technique badge).** `worker-enrich` consumes from NATS: geoip-lite pin, static reputation, heuristic MITRE mapper; write transcript to object storage; update the event; wire autoscale min 0. Event drawer shows attacker pin + MITRE badge + transcript replay (xterm). **Rung 2.**

**M6 — One-click deploy + second decoy + search (working: full mesh demo).** UI deploy flow (template → provisioned decoy appears on map — pre-provisioned fallback is fine), add `decoy-http`, Postgres full-text Intel Explorer with facets. **Rung 3 — the intended Phase 1.**

**M7 — Polish pass (working: it feels like a product).** Empty/loading/error states, landing page, light LLM badge upgrade (optional), scheduler-as-interval health check, demo seed/ambient traffic. 🚀 Redeploy.

**M8 — Demo hardening + submission.** Rehearse the exact demo path, record the backup video (do this the moment M4 works, then re-record after M6), finalize README + "how Zerops is used", tag `submission`, confirm live URL stays up, disclose AI tools, submit. 🚀 Final deploy.

Rule: never leave a milestone half-done across a session — each `main` commit should run. If time collapses, **stop at whichever Rung you've cleared and submit** (M4 = safe floor, M6 = target).

---

## PART 9 — Things You Must Do Manually (Claude Code cannot)

Claude Code writes code and runs `zcli`/`git`/`docker` locally, but it cannot touch your accounts or click dashboards. You must do these:

**GitHub:**
- Create the public repo `chimera` (or run `gh repo create chimera --public`). Claude Code can push once the remote exists and you're authenticated.

**Zerops dashboard/account:**
- **Delete any leftover test services/projects** from your earlier exploration (stop credit drain). ← do this first.
- **Create the `chimera` project** on the **free Lightweight core**.
- **Generate a personal access token** for zcli, and authenticate locally (`zcli login <token>`). Claude Code needs this to deploy — but *you* generate the token.
- **Provision the managed services** (Postgres, Valkey, NATS, object storage) — via the service catalog or by importing the `zerops-project-import.yaml` Claude Code generates. Managed-service creation is a dashboard action, not a code action.
- **Enable public access** on `web`, `api`, and a **public TCP port** on each decoy (so attackers can reach 2222/8080). Private services (DB/Valkey/NATS/storage) stay private — don't expose them.
- **Set secret env vars** in the dashboard: `JWT_SECRET`, and later `ANTHROPIC_API_KEY` if you use it.
- **Confirm the free Zerops subdomain** for `web`/`api` (your live URLs). No DNS work needed.
- **Watch the credit meter** daily during the live window.

**Explicitly NOT required (don't get stuck looking for these):**
- No DNS / custom domain (using the free subdomain).
- No MaxMind signup (using geoip-lite).
- No payment method / no credit top-up (that's the whole point).
- No manual server/VM/OS setup (Zerops manages it).
- No API keys at all *unless* you opt into the LLM badge.

**Local machine (one-time):** install Node 22, pnpm, Docker, zcli, Git (Part 3); authenticate `gh` and `zcli`.

---

## PART 10 — Claude Code Readiness: the first prompt

Before opening Claude Code, make sure: Node 22 + pnpm + Docker + Git + zcli installed; GitHub authenticated; the empty public `chimera` repo cloned locally; this guide and your Chimera blueprint/roadmap files in the repo (e.g., in a `/docs` folder) so Claude Code has the full context.

Then give Claude Code this as the **very first prompt**:

> **Context:** We're building **Chimera**, a self-serve deception mesh, for the Zerops hackathon. Read `/docs/chimera-implementation-prep.md`, `/docs/chimera-phase-roadmap.md`, and the Chimera blueprint in `/docs` — they are the source of truth. Hard budget: ~$14–15 Zerops credits, never exceeded; stay on the free Lightweight core; shared CPU + 0.25 GB RAM per container; scale workers to zero. Priorities in order: win the hackathon, exceptional product, genuine Zerops usage, low credit use, low complexity. Prefer polishing the demo over adding features.
>
> **Task — Milestone M0 only (do not run ahead):** Scaffold the monorepo exactly as specified in Part 5 of the prep guide: pnpm workspaces; `apps/api` (Fastify + TS with a `/healthz` route), `apps/web` (SvelteKit + Tailwind, blank dark shell), `apps/worker-enrich`, `apps/decoys/ssh`, `apps/decoys/http`, and `packages/shared` (with the Zod `eventSchema`). Add `docker-compose.dev.yml` running Postgres + Valkey + NATS + MinIO. Add `.env.example` with all the [NOW] variables from Part 7, `.gitignore`, `LICENSE` (MIT), a `README.md` stub, root scripts (`dev`, `build`, `lint`), and a `zerops.yaml` stub for the five runtime services.
>
> **Constraints:** all TypeScript, one toolchain, no Python, no Go, no Prisma, no Meilisearch. Use the exact dependency list from Part 6. After scaffolding, run `pnpm install`, bring up docker-compose, confirm `api` serves `/healthz` and `web` renders, then stop and show me the tree and how to verify. Do **not** start M1 until I confirm M0 works.

Working with Claude Code after that: go **one milestone at a time** (M0 → M1 → …), confirm each runs before advancing, commit at every green milestone, and deploy to Zerops at M4 (first) and again at M7/M8. Keep this guide and the roadmap in `/docs` so every prompt can reference them — that's what keeps you inside Claude Code without re-explaining context.

---

## The one thing that protects your budget above all
Develop locally against docker-compose (free), deploy to Zerops only the finished milestones, stay on the free Lightweight core, keep every container on shared CPU + 0.25 GB RAM, scale the worker to zero, and glance at the credit meter once a day. Do that and Phase 1 costs you a few dollars of your $15 and stays live through judging with margin to spare.

