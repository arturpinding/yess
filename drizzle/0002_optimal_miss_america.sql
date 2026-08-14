CREATE TYPE "public"."media_provider_operation_action" AS ENUM('provision', 'start', 'publish', 'unpublish', 'stop', 'refresh');--> statement-breakpoint
CREATE TYPE "public"."media_provider_operation_state" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."media_provider_resource_state" AS ENUM('absent', 'provisioned', 'encoding', 'published', 'stopped', 'failed');--> statement-breakpoint
CREATE TABLE "media_provider_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stream_id" uuid NOT NULL,
	"resource_id" uuid,
	"action" "media_provider_operation_action" NOT NULL,
	"state" "media_provider_operation_state" DEFAULT 'pending' NOT NULL,
	"idempotency_key" varchar(180) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"reason" text NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"provider_request_id" varchar(180),
	"safe_result" jsonb,
	"error_code" varchar(120),
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_provider_operations_attempts_check" CHECK ("media_provider_operations"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "media_provider_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stream_id" uuid NOT NULL,
	"provider_key" varchar(100) NOT NULL,
	"provider_resource_id" varchar(200) NOT NULL,
	"desired_state" "media_provider_resource_state" DEFAULT 'absent' NOT NULL,
	"observed_state" "media_provider_resource_state" DEFAULT 'absent' NOT NULL,
	"playback_locator" text,
	"generation" integer DEFAULT 1 NOT NULL,
	"last_healthy_at" timestamp with time zone,
	"last_error_code" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_provider_resources_stream_id_unique" UNIQUE("stream_id"),
	CONSTRAINT "media_provider_resources_generation_check" CHECK ("media_provider_resources"."generation" > 0)
);
--> statement-breakpoint
ALTER TABLE "media_provider_operations" ADD CONSTRAINT "media_provider_operations_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_provider_operations" ADD CONSTRAINT "media_provider_operations_resource_id_media_provider_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."media_provider_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_provider_resources" ADD CONSTRAINT "media_provider_resources_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_provider_operations_idempotency_unique" ON "media_provider_operations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "media_provider_operations_stream_requested_idx" ON "media_provider_operations" USING btree ("stream_id","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_provider_resources_provider_ref_unique" ON "media_provider_resources" USING btree ("provider_key","provider_resource_id");--> statement-breakpoint
CREATE INDEX "media_provider_resources_observed_state_idx" ON "media_provider_resources" USING btree ("observed_state","updated_at");