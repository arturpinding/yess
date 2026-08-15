CREATE TYPE "public"."live_broadcast_state" AS ENUM('provisioned', 'live', 'stopped', 'failed');--> statement-breakpoint
CREATE TABLE "live_broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" char(8) NOT NULL,
	"title" varchar(120) NOT NULL,
	"locale" varchar(5) NOT NULL,
	"state" "live_broadcast_state" DEFAULT 'provisioned' NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_input_id" varchar(160) NOT NULL,
	"playback_url" text NOT NULL,
	"publisher_token_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_broadcasts_code_check" CHECK ("live_broadcasts"."code" ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
	CONSTRAINT "live_broadcasts_title_check" CHECK (char_length(btrim("live_broadcasts"."title")) between 1 and 120),
	CONSTRAINT "live_broadcasts_locale_check" CHECK ("live_broadcasts"."locale" in ('et', 'en')),
	CONSTRAINT "live_broadcasts_provider_check" CHECK ("live_broadcasts"."provider" = 'cloudflare-stream'),
	CONSTRAINT "live_broadcasts_publisher_hash_check" CHECK ("live_broadcasts"."publisher_token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "live_broadcasts_playback_url_check" CHECK ("live_broadcasts"."playback_url" like 'https://%'),
	CONSTRAINT "live_broadcasts_expiry_check" CHECK ("live_broadcasts"."expires_at" > "live_broadcasts"."created_at"),
	CONSTRAINT "live_broadcasts_version_check" CHECK ("live_broadcasts"."version" > 0),
	CONSTRAINT "live_broadcasts_state_times_check" CHECK ((
        ("live_broadcasts"."state" = 'provisioned' and "live_broadcasts"."started_at" is null and "live_broadcasts"."ended_at" is null)
        or ("live_broadcasts"."state" = 'live' and "live_broadcasts"."started_at" is not null and "live_broadcasts"."ended_at" is null)
        or ("live_broadcasts"."state" in ('stopped', 'failed') and "live_broadcasts"."ended_at" is not null)
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "live_broadcasts_code_unique" ON "live_broadcasts" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "live_broadcasts_provider_input_unique" ON "live_broadcasts" USING btree ("provider","provider_input_id");--> statement-breakpoint
CREATE INDEX "live_broadcasts_state_expiry_idx" ON "live_broadcasts" USING btree ("state","expires_at");