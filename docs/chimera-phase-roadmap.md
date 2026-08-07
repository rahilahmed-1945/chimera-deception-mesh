# Chimera — Four-Phase Development Roadmap

**Rule applied throughout:** Phase 1 contains *only* what raises hackathon judging scores (originality, execution, usefulness, Zerops usage, demo). Everything else is deferred to the earliest phase where it earns its keep, without ever changing the core architecture. Nothing new is invented — this is purely a re-sequencing of the existing blueprint.

**Judging-value test for Phase 1:** a component stays in Phase 1 only if it (a) is on the critical path of the demo flow *deploy → attack → red-flash → intel → isolation*, or (b) makes the product visibly polished, or (c) is a Zerops primitive that *is* the "built for Zerops" story. If it fails all three, it moves out.

Essentiality legend: **E** = essential (Phase 1 fails without it) · **R** = recommended (materially improves the score) · **O** = optional (nice, low judging impact).

---

## Phase 1 — Hackathon Winner

The only phase guaranteed to be built. This is essentially the 48h blueprint build, disciplined down to score-maximizing essentials.

### Infrastructure & Zerops services

| Component | Essentiality | Why it's in Phase 1 |
|---|:---:|---|
| Zerops project + `zerops.yaml` (multi-service) | **E** | The whole submission requirement; the infra *is* the story. |
| `api` / control plane (public) | **E** | The brain; serves REST + WebSocket. |
| `web` frontend (SSR/static, public) | **E** | The demo surface. |
| `decoy-ssh` (isolated container) | **E** | The hero decoy; the live-attack wow depends on it. |
| `decoy-http` (isolated container) | **E** | Proves it's a *mesh*, not one trap; second decoy type for the demo. |
| `worker-enrich` (autoscaling, min 0) | **E** | Enrichment + the autoscaling Zerops flex; configure autoscaling now (near-zero extra effort). |
| Managed PostgreSQL | **E** | System of record for events/decoys. |
| Managed Valkey | **E** | WebSocket fan-out + live map state + rate counters. |
| NATS (+ JetStream) broker | **E** | The one-way event spine decoy→api→worker; core to the architecture. |
| Object storage (S3) | **E** | Session transcripts; keeps blobs out of Postgres; a distinct Zerops service to showcase. |
| Meilisearch | **R** | Powers Intel Explorer search; strong "usefulness" signal, moderate effort. |
| Private VLAN + firewall (decoy→data-plane blocked) | **E** | The blast-radius isolation demo — the single strongest "built for Zerops" moment. |
| `scheduler` (health check + intel refresh) | **R** | Cheap; shows operational maturity + uses the scheduled-jobs primitive. |
| Zerops build pipeline / ZCP deploy | **E** | How it gets live and stays live through judging. |

### Backend / workflows

| Component | Essentiality | Why |
|---|:---:|---|
| Auth: email/password + JWT | **E** | Minimal gate; needed for a real multi-user-looking app. |
| Decoy lifecycle: provision / list / destroy | **E** | Drives the one-click-deploy demo opener. |
| One-click deploy flow (template → live node) | **E** | The demo's opening wow; must be smooth (pre-provision fallback allowed). |
| Event spine: decoy → NATS → api → WS → map | **E** | The make-or-break real-time backbone. |
| `worker-enrich`: GeoIP + ASN | **E** | Turns a raw hit into an attacker on the map. |
| `worker-enrich`: reputation (static list) | **R** | Cheap credibility; static feed is enough for the demo. |
| AI/heuristic classification + MITRE mapping | **E** | The "intelligence not just logs" beat; heuristics-first, LLM fallback. |
| Object-storage write of session transcript | **E** | Feeds the event drawer; demonstrates storage service. |
| Meilisearch indexing on enrich | **R** | Enables the Intel Explorer search moment. |
| Basic retry on enrichment jobs | **R** | Reliability during a live demo; keep it simple. |
| Scheduled health check + auto-redeploy burned decoy | **R** | Robustness signal; light to implement. |

### UI pages

| Component | Essentiality | Why |
|---|:---:|---|
| Dashboard: live map + event feed + KPI tiles | **E** | The centerpiece; red-flash-on-attack lives here. |
| Event detail drawer (attacker, transcript, MITRE badge) | **E** | The "intelligence" reveal in the demo. |
| Decoys page + template chooser / deploy modal | **E** | The deploy interaction. |
| Intel Explorer (search + facets) | **R** | The "scale + usefulness" beat; strong score lift. |
| Empty / loading / error states | **E** | "Extremely polished" is a stated Phase-1 goal; judges feel rough edges. |
| Session-transcript display (static, in drawer) | **E** | Shows captured commands; full replay *player* deferred. |
| Landing page (light) | **R** | Adds polish + framing; keep it one strong page, don't over-invest. |
| Auth screens (login/register) | **E** | Entry point; minimal styling. |

### Database tables

| Tables | Essentiality | Why |
|---|:---:|---|
| tenants, users | **E** | Even single-org, the schema should be right from day one (no rearchitecting later). |
| decoy_templates, decoys | **E** | Deploy + list. |
| events (partitioned), attackers | **E** | The core data + per-IP aggregate for KPIs. |
| threat_intel (static) | **R** | Backs reputation enrichment. |

### AI usage

| Component | Essentiality | Why |
|---|:---:|---|
| Heuristic MITRE mapper (regex → techniques) | **E** | Deterministic, always-on technique badges; the safe demo path. |
| LLM classifier fallback (ambiguous sessions) | **R** | Adds the polished "intent" label; degrade to heuristics if it fights you. |

**Phase 1 explicitly EXCLUDES** (moved out, with target phase): OAuth/MFA (P2), API keys (P2), alerting integrations + `worker-alert` (P2), full session-replay player (P2), RBAC/multi-user orgs (P2), extra decoy templates (P2), canary tokens (P2), admin dashboard (P2/P3), billing (P2), monitoring/metrics dashboards (P3), DLQ + advanced retry (P2/P3), audit_log (P3/P4), and all of V3/Enterprise. None of these move the demo needle enough to justify Phase-1 effort.

---

## Phase 2 — Startup MVP

Build on the finished Phase 1. Add what early real users need, without touching the core architecture. These are mostly *additive* modules that plug into the existing spine.

| Component | Essentiality (for a startup MVP) | Why here, not earlier/later |
|---|:---:|---|
| `worker-alert` + Slack / PagerDuty / email / webhook | **E** | An alert nobody sees is useless to a real user; this is the #1 post-hackathon gap. Separate consumer, no core change. |
| Alert rules engine (alert_rules table) | **E** | Users must choose what notifies them. |
| Integrations config + secrets (integrations table) | **E** | Backs the above. |
| OAuth (GitHub) + MFA (TOTP) | **R** | Real signup friction + basic account security. |
| API keys (scoped, hashed) | **R** | Early programmatic users + automation. |
| Expanded decoy templates (Postgres/MySQL, Redis, Git, S3, cloud-metadata) | **E** | Coverage is the product's value; more decoy types = more real detection surface. |
| Canary tokens (fake keys/docs/URL/DNS) | **R** | Extends deception beyond services; cheap high-value tripwires. |
| Full session-replay player (xterm-style playback) | **R** | Turns the transcript into an investigation tool users love. |
| RBAC + multi-user organizations | **E** | Any team adoption needs more than one seat + roles. |
| Autoscaling sensor groups (N replicas of a decoy) | **R** | Distributed-sensor coverage; leans on the existing autoscaling primitive. |
| Billing + plan enforcement (decoy caps, retention) | **E** | To charge anyone, plans must be enforced. |
| Basic admin dashboard (tenants, fleet health, abuse flags) | **R** | You need operational visibility once outsiders use it. |
| DLQ + robust retry/backoff on all consumers | **R** | Reliability once real traffic (and real bursts) arrive. |
| Real reputation/threat-intel feeds (replace static) | **R** | Enrichment quality for paying users. |

---

## Phase 3 — Startup V1 (serious SaaS)

Production-hardening, scale, and the collaboration/observability layer that makes it a dependable product.

| Component | Essentiality (for V1 SaaS) | Why here |
|---|:---:|---|
| Monitoring / metrics / dashboards (events/s, queue lag, worker latency, decoy health) | **E** | Can't run a paid service blind; SLOs need telemetry. |
| Alerting on pipeline lag / DLQ growth | **E** | Operational safety at scale. |
| Postgres scaling (read replicas, partition pruning at scale) | **E** | Event volume grows fast; retention via partition drop. |
| Meilisearch scaling (or move toward Elasticsearch) | **R** | History search at multi-tenant scale. |
| SIEM export (CEF/syslog, generic) | **E** | Table-stakes for security buyers plugging into existing SOCs. |
| Attack-graph visualization (multi-decoy path reconstruction) | **R** | Differentiated analyst value; builds on existing event data. |
| Advanced analytics in Intel Explorer (aggregate charts, saved searches, trends) | **R** | Depth for daily users. |
| Security hardening pass (RLS, secrets rotation, WAF tuning, abuse detection) | **E** | Selling security software raises the bar on your own security. |
| CI/CD maturity (staging↔prod promotion, gated migrations, PR previews) | **E** | Safe iteration once customers depend on uptime. |
| Disaster recovery (PITR, storage replication, restore runbook, DLQ replay) | **E** | Data durability commitments. |
| Fine-grained RBAC + richer org management | **R** | Larger teams. |
| Additional protocol decoys (broader library) | **R** | Widening coverage as a continuous effort. |

---

## Phase 4 — Full Vision

The complete original vision: enterprise, advanced automation, and the data-network moat.

| Component | Essentiality (to realize the vision) | Why last |
|---|:---:|---|
| Cross-tenant threat-intelligence network (opt-in, anonymized) + community blocklist | **E** (moat) | The defining long-term differentiator; needs scale + privacy work + many tenants to matter. |
| Privacy-preserving intel sharing (data minimization / DP) | **E** | Required to make cross-tenant sharing safe and sellable. |
| Adaptive / anti-fingerprint decoys (self-varying realism, tar-pitting) | **R** | Advanced R&D; resists attacker evasion. |
| VPC connectors (deploy decoys into customer AWS/GCP/Azure) | **E** (enterprise) | Meets customers where their assets live. |
| Auto-deception recommendations (analyze real inventory → suggest decoys) | **R** | Advanced automation; reduces setup effort. |
| Enterprise edition: self-hosted / air-gapped | **E** (enterprise) | Unlocks regulated buyers who can't use SaaS. |
| SSO / SAML / SCIM | **E** (enterprise) | Enterprise identity requirement. |
| Immutable audit logs (audit_log table) + data residency | **E** (enterprise) | Compliance + governance. |
| Compliance report generator (SOC2 / PCI / ISO evidence) | **R** | Sales accelerant for regulated buyers. |
| Bi-directional SIEM/XDR + SOAR integration | **R** | Deep enterprise ecosystem fit. |
| Custom decoy authoring SDK | **O** | Extensibility; power-user/enterprise feature. |
| Threat-intel feed as a standalone data product | **R** | Second revenue line built on the moat. |

---

## Development Time Estimates

*One experienced developer using Claude Max extensively. "Focused work" = actual heads-down build time; calendar assumes normal life around it.*

| Phase | Focused effort | Realistic calendar | Notes |
|---|---|---|---|
| **Phase 1 — Hackathon Winner** | ~40–55 hrs | Fits the 48h event (tight but doable) | This *is* the hackathon sprint. Claude Max compresses the wiring; the risk is the live event spine + polish, not volume. |
| **Phase 2 — Startup MVP** | ~80–140 hrs | 3–5 weeks part-time | Mostly additive modules on a stable spine; alerting + templates + billing + RBAC dominate the time. |
| **Phase 3 — Startup V1** | ~250–400 hrs | 2–4 months | Hardening/scale/observability is slower per-feature than green-field; SIEM + DR + security pass are heavy. |
| **Phase 4 — Full Vision** | ~500–900+ hrs | 4–8+ months, ongoing | Enterprise + cross-tenant intel + privacy engineering; effectively continuous product development, not a finite sprint. |

Reality check on Phase 1: the *feature count* is small and Claude Max makes the boilerplate fast, but "extremely polished" and a flawless live demo consume disproportionate time. Budget at least the final ~8 hours purely for demo rehearsal, seeding, backup-video recording, and bug-fixing the demo path — not new features.

---

## The Exact Stopping Point (Phase 1 triage ladder)

Build Phase 1 in this strict order. Each rung is independently submittable — the moment you clear a rung and the clock is threatening, **stop and submit.** Everything above the line you've reached is pure score-maximization, not survival.

**Rung 0 — "It exists on Zerops" (not yet submittable):** api + web + Postgres + NATS deployed and live on Zerops with a public URL. *Don't submit here — no wow yet.*

**Rung 1 — MINIMUM WINNING SUBMISSION (the hard floor — submit here if forced):**
one `decoy-ssh` running (pre-provisioned is fine) + the live map + attack it and the node **flashes red in real time** + the event is captured and shown + it's all on Zerops **with the private-VLAN isolation real and demonstrable.** This is the irreducible wow and the Zerops story in one. **If the deadline is imminent, this is the line: a submission at Rung 1 can compete.** Record the backup video the instant Rung 1 works.

**Rung 2 — STRONG SUBMISSION (target if you have normal time):** add GeoIP + attacker pin on the map, the **event detail drawer with the session transcript and the MITRE/technique badge** (heuristic mapper is enough), and the **one-click deploy flow** from the UI. Now the demo tells the full *deploy → attack → catch → intelligence* story.

**Rung 3 — POLISHED SUBMISSION (the intended Phase 1):** add the **second decoy (`decoy-http`)** to prove "mesh," **Intel Explorer search** (Meilisearch), **KPI tiles**, the **LLM classification** upgrade, visible **autoscaling** on `worker-enrich`, the **scheduler** health/intel jobs, and a full **empty/loading/error-state** polish pass plus a light **landing page**.

**Rung 4 — EXTRA CREDIT (only if time is left over):** reputation feed polish, transcript-replay niceties, extra demo seeding/ambient traffic, and any Phase-2 item that happens to be trivially close.

**Decision rule during the event:** never start a rung you can't finish and re-stabilize the demo before the deadline. A clean submission at Rung 2 beats a broken half-built Rung 3. Protect the live event spine (Rung 1) above literally everything — if it ever breaks, drop to the backup video rather than shipping a dead demo.

---

## One-line summary

Phase 1 = the deploy→attack→map→intel→isolation demo on real Zerops services, nothing more. Phase 2 = make it usable for real users (alerts, more decoys, auth, billing, RBAC). Phase 3 = make it dependable at scale (monitoring, SIEM, DR, hardening). Phase 4 = the moat and the enterprise (cross-tenant intel + privacy, VPC connectors, self-hosted, SSO, compliance). If the clock runs out, **Rung 1 is your safe submission floor; Rung 3 is the win target.**
