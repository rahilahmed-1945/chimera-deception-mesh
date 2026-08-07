import { sql } from 'drizzle-orm';
import {
  doublePrecision,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Chimera Phase 1 schema — implements docs/chimera-phase1-schema.md (FROZEN).
 *
 * M1 implements the six core tables. `threat_intel` (optional, first used M5)
 * and the events full-text `tsvector` + GIN index (first used M6) are added at
 * their own milestones per the frozen spec's annotations.
 */

// --- tenants: top-level ownership boundary -------------------------------------
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- users: auth (register/login -> JWT) ---------------------------------------
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_key').on(t.email), index('users_tenant_idx').on(t.tenantId)],
);

// --- decoy_templates: catalog of deployable decoy types ------------------------
export const decoyTemplates = pgTable(
  'decoy_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    protocol: text('protocol').notNull(),
    defaultPort: integer('default_port').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('decoy_templates_key_key').on(t.key)],
);

// --- decoys: provisioned decoy instances (map nodes) ---------------------------
export const decoys = pgTable(
  'decoys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    templateId: uuid('template_id')
      .notNull()
      .references(() => decoyTemplates.id),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    lastEventAt: timestamp('last_event_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('decoys_tenant_idx').on(t.tenantId), index('decoys_template_idx').on(t.templateId)],
);

// --- attackers: per-source-IP aggregate (map pin + KPIs) -----------------------
export const attackers = pgTable(
  'attackers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    ip: inet('ip').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    eventCount: integer('event_count').notNull().default(0),
    countryCode: text('country_code'),
    city: text('city'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    reputation: text('reputation'),
  },
  (t) => [
    uniqueIndex('attackers_tenant_ip_key').on(t.tenantId, t.ip),
    index('attackers_tenant_last_seen_idx').on(t.tenantId, t.lastSeenAt.desc()),
  ],
);

// --- events: the core interaction log (feed + drawer) --------------------------
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    decoyId: uuid('decoy_id')
      .notNull()
      .references(() => decoys.id),
    attackerId: uuid('attacker_id')
      .notNull()
      .references(() => attackers.id),
    kind: text('kind').notNull(),
    sourceIp: inet('source_ip').notNull(),
    sourcePort: integer('source_port'),
    techniques: text('techniques')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    transcriptKey: text('transcript_key'),
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('events_tenant_created_idx').on(t.tenantId, t.createdAt.desc()),
    index('events_decoy_created_idx').on(t.decoyId, t.createdAt.desc()),
    index('events_attacker_idx').on(t.attackerId),
  ],
);
