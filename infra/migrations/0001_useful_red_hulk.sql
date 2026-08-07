CREATE TABLE IF NOT EXISTS "threat_intel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"indicator" "cidr" NOT NULL,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "threat_intel_indicator_key" ON "threat_intel" USING btree ("indicator");