CREATE TYPE "public"."demo_broadcast_state" AS ENUM('created', 'offer_ready', 'viewer_claimed', 'connected');--> statement-breakpoint
CREATE TABLE "demo_broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" char(8) NOT NULL,
	"locale" varchar(5) NOT NULL,
	"state" "demo_broadcast_state" DEFAULT 'created' NOT NULL,
	"publisher_token_hash" char(64) NOT NULL,
	"viewer_token_hash" char(64),
	"offer_sdp" text,
	"offer_sdp_hash" char(64),
	"answer_sdp" text,
	"answer_sdp_hash" char(64),
	"viewer_claimed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_broadcasts_code_check" CHECK ("demo_broadcasts"."code" ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
	CONSTRAINT "demo_broadcasts_locale_check" CHECK ("demo_broadcasts"."locale" in ('et', 'en')),
	CONSTRAINT "demo_broadcasts_publisher_hash_check" CHECK ("demo_broadcasts"."publisher_token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "demo_broadcasts_viewer_hash_check" CHECK ("demo_broadcasts"."viewer_token_hash" is null or "demo_broadcasts"."viewer_token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "demo_broadcasts_offer_pair_check" CHECK (("demo_broadcasts"."offer_sdp" is null) = ("demo_broadcasts"."offer_sdp_hash" is null)),
	CONSTRAINT "demo_broadcasts_answer_pair_check" CHECK (("demo_broadcasts"."answer_sdp" is null) = ("demo_broadcasts"."answer_sdp_hash" is null)),
	CONSTRAINT "demo_broadcasts_viewer_pair_check" CHECK (("demo_broadcasts"."viewer_token_hash" is null) = ("demo_broadcasts"."viewer_claimed_at" is null)),
	CONSTRAINT "demo_broadcasts_expiry_check" CHECK ("demo_broadcasts"."expires_at" > "demo_broadcasts"."created_at"),
	CONSTRAINT "demo_broadcasts_version_check" CHECK ("demo_broadcasts"."version" > 0),
	CONSTRAINT "demo_broadcasts_state_check" CHECK ((
        ("demo_broadcasts"."state" = 'created' and "demo_broadcasts"."offer_sdp" is null and "demo_broadcasts"."viewer_token_hash" is null and "demo_broadcasts"."answer_sdp" is null)
        or ("demo_broadcasts"."state" = 'offer_ready' and "demo_broadcasts"."offer_sdp" is not null and "demo_broadcasts"."viewer_token_hash" is null and "demo_broadcasts"."answer_sdp" is null)
        or ("demo_broadcasts"."state" = 'viewer_claimed' and "demo_broadcasts"."offer_sdp" is not null and "demo_broadcasts"."viewer_token_hash" is not null and "demo_broadcasts"."answer_sdp" is null)
        or ("demo_broadcasts"."state" = 'connected' and "demo_broadcasts"."offer_sdp" is not null and "demo_broadcasts"."viewer_token_hash" is not null and "demo_broadcasts"."answer_sdp" is not null)
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "demo_broadcasts_code_unique" ON "demo_broadcasts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "demo_broadcasts_expiry_idx" ON "demo_broadcasts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "demo_broadcasts_state_expiry_idx" ON "demo_broadcasts" USING btree ("state","expires_at");