-- M6 Intel Explorer: generated full-text search vector over events.
-- Idempotent (safe to rerun): CREATE OR REPLACE FUNCTION + guarded ADD COLUMN / CREATE INDEX.
-- Not part of the Drizzle schema model, so ingest/broadcast/responses are unchanged.
--
-- array_to_string is marked STABLE (conservative) and so cannot be used directly
-- in a generated column; for text[] the join is deterministic, so we wrap it in a
-- trivially IMMUTABLE function to include the MITRE techniques in the index.
CREATE OR REPLACE FUNCTION chimera_join_techniques(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT coalesce(array_to_string($1, ' '), '') $$;
--> statement-breakpoint
-- Non-alphanumerics are normalised to spaces first so path/username/ip/technique
-- fragments tokenise as words (e.g. "/wp-admin" -> "wp", "admin") under 'simple'.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      regexp_replace(
        coalesce("payload"::text, '') || ' ' ||
        chimera_join_techniques("techniques") || ' ' ||
        host("source_ip"),
        '[^a-zA-Z0-9]+', ' ', 'g'
      )
    )
  ) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_search_idx" ON "events" USING gin ("search_vector");
