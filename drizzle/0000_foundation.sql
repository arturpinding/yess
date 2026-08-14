CREATE TYPE "public"."billing_interval" AS ENUM('one_time', 'month', 'year');--> statement-breakpoint
CREATE TYPE "public"."content_kind" AS ENUM('live', 'replay', 'highlight');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('web', 'ios', 'android', 'tv', 'other');--> statement-breakpoint
CREATE TYPE "public"."editorial_state" AS ENUM('draft', 'scheduled', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."entitlement_source" AS ENUM('subscription', 'purchase', 'voucher', 'trial', 'grant');--> statement-breakpoint
CREATE TYPE "public"."event_state" AS ENUM('scheduled', 'delayed', 'live', 'paused', 'finished', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ingestion_kind" AS ENUM('schedule', 'results', 'media', 'manual');--> statement-breakpoint
CREATE TYPE "public"."media_asset_kind" AS ENUM('recording', 'replay', 'highlight', 'poster', 'thumbnail', 'caption', 'audio_description');--> statement-breakpoint
CREATE TYPE "public"."media_asset_state" AS ENUM('pending', 'processing', 'ready', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'push', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('event_starting_soon', 'event_started', 'schedule_changed', 'venue_changed', 'followed_athlete_competing', 'important_result', 'highlight_available');--> statement-breakpoint
CREATE TYPE "public"."notification_state" AS ENUM('pending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."outbox_state" AS ENUM('pending', 'processing', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('competitor', 'home', 'away');--> statement-breakpoint
CREATE TYPE "public"."playback_state" AS ENUM('authorized', 'playing', 'ended', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."product_kind" AS ENUM('subscription', 'event_pass', 'competition_pass', 'trial', 'voucher');--> statement-breakpoint
CREATE TYPE "public"."profile_kind" AS ENUM('adult', 'child');--> statement-breakpoint
CREATE TYPE "public"."rights_access" AS ENUM('free', 'entitled', 'external_only', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."stream_protocol" AS ENUM('webrtc', 'll_hls', 'hls', 'external');--> statement-breakpoint
CREATE TYPE "public"."stream_state" AS ENUM('provisioning', 'ready', 'live', 'degraded', 'ended', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."subscription_state" AS ENUM('trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."timeline_kind" AS ENUM('period_start', 'period_end', 'score', 'penalty', 'substitution', 'commentary', 'result', 'other');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('viewer', 'editor', 'operator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_state" AS ENUM('active', 'invited', 'suspended', 'deletion_requested');--> statement-breakpoint
CREATE TABLE "athlete_team_memberships" (
	"athlete_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"shirt_number" varchar(12),
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_team_memberships_athlete_id_team_id_starts_at_pk" PRIMARY KEY("athlete_id","team_id","starts_at"),
	CONSTRAINT "athlete_memberships_dates_check" CHECK ("athlete_team_memberships"."ends_at" is null or "athlete_team_memberships"."ends_at" > "athlete_team_memberships"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "athletes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"primary_sport_id" uuid NOT NULL,
	"slug" varchar(140) NOT NULL,
	"given_name" varchar(100) NOT NULL,
	"family_name" varchar(100) NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"nationality_code" char(2) NOT NULL,
	"birth_date" timestamp,
	"portrait_url" text,
	"biography_et" text,
	"biography_en" text,
	"key_facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athletes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(120) NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" uuid NOT NULL,
	"request_id" varchar(120),
	"reason" text,
	"before" jsonb,
	"after" jsonb,
	"ip_hash" char(64),
	"user_agent_summary" varchar(240),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport_id" uuid NOT NULL,
	"slug" varchar(140) NOT NULL,
	"name" varchar(200) NOT NULL,
	"name_et" varchar(200),
	"name_en" varchar(200),
	"organizer" varchar(180),
	"country_code" char(2),
	"logo_url" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competitions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "device_platform" NOT NULL,
	"name" varchar(120) NOT NULL,
	"device_fingerprint_hash" varchar(128),
	"push_token_ciphertext" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editorial_collection_items" (
	"collection_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"event_id" uuid,
	"athlete_id" uuid,
	"team_id" uuid,
	"competition_id" uuid,
	"highlight_id" uuid,
	"label_et" varchar(160),
	"label_en" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editorial_collection_items_collection_id_position_pk" PRIMARY KEY("collection_id","position"),
	CONSTRAINT "editorial_collection_items_position_check" CHECK ("editorial_collection_items"."position" >= 0),
	CONSTRAINT "editorial_collection_items_target_check" CHECK (num_nonnulls("editorial_collection_items"."event_id", "editorial_collection_items"."athlete_id", "editorial_collection_items"."team_id", "editorial_collection_items"."competition_id", "editorial_collection_items"."highlight_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "editorial_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(140) NOT NULL,
	"title_et" varchar(240) NOT NULL,
	"title_en" varchar(240) NOT NULL,
	"description_et" text,
	"description_en" text,
	"state" "editorial_state" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editorial_collections_slug_unique" UNIQUE("slug"),
	CONSTRAINT "editorial_collections_dates_check" CHECK ("editorial_collections"."ends_at" is null or "editorial_collections"."starts_at" is null or "editorial_collections"."ends_at" > "editorial_collections"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" uuid,
	"product_id" uuid NOT NULL,
	"subscription_id" uuid,
	"source" "entitlement_source" NOT NULL,
	"source_reference" varchar(180) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlements_dates_check" CHECK ("entitlements"."ends_at" > "entitlements"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "event_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"athlete_id" uuid,
	"team_id" uuid,
	"role" "participant_role" DEFAULT 'competitor' NOT NULL,
	"seed" smallint,
	"lane_or_position" varchar(60),
	"is_estonian" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_participants_exactly_one_check" CHECK (num_nonnulls("event_participants"."athlete_id", "event_participants"."team_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"season_id" uuid,
	"venue_id" uuid,
	"slug" varchar(180) NOT NULL,
	"title_et" varchar(240) NOT NULL,
	"title_en" varchar(240) NOT NULL,
	"description_et" text,
	"description_en" text,
	"state" "event_state" DEFAULT 'scheduled' NOT NULL,
	"scheduled_start_at" timestamp with time zone NOT NULL,
	"actual_start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"original_start_at" timestamp with time zone,
	"status_detail_et" varchar(240),
	"status_detail_en" varchar(240),
	"age_rating" smallint DEFAULT 0 NOT NULL,
	"score_visibility" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug"),
	CONSTRAINT "events_end_check" CHECK ("events"."end_at" is null or "events"."end_at" > coalesce("events"."actual_start_at", "events"."scheduled_start_at")),
	CONSTRAINT "events_age_rating_check" CHECK ("events"."age_rating" between 0 and 18),
	CONSTRAINT "events_version_check" CHECK ("events"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"athlete_id" uuid,
	"team_id" uuid,
	"sport_id" uuid,
	"competition_id" uuid,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_exactly_one_check" CHECK (num_nonnulls("follows"."athlete_id", "follows"."team_id", "follows"."sport_id", "follows"."competition_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "highlights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"title_et" varchar(240) NOT NULL,
	"title_en" varchar(240) NOT NULL,
	"start_offset_seconds" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer NOT NULL,
	"published_at" timestamp with time zone,
	"spoiler_sensitive" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "highlights_offsets_check" CHECK ("highlights"."start_offset_seconds" >= 0 and "highlights"."duration_seconds" > 0)
);
--> statement-breakpoint
CREATE TABLE "ingestion_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"kind" "ingestion_kind" NOT NULL,
	"base_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"trust_priority" smallint DEFAULT 100 NOT NULL,
	"last_successful_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_sources_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"kind" "media_asset_kind" NOT NULL,
	"state" "media_asset_state" DEFAULT 'pending' NOT NULL,
	"title_et" varchar(240),
	"title_en" varchar(240),
	"storage_key" text,
	"provider_reference" varchar(200),
	"mime_type" varchar(120),
	"duration_seconds" integer,
	"language" varchar(12),
	"checksum_sha256" char(64),
	"spoiler_sensitive" boolean DEFAULT false NOT NULL,
	"available_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_duration_check" CHECK ("media_assets"."duration_seconds" is null or "media_assets"."duration_seconds" >= 0),
	CONSTRAINT "media_assets_availability_check" CHECK ("media_assets"."expires_at" is null or "media_assets"."available_at" is null or "media_assets"."expires_at" > "media_assets"."available_at")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"athlete_id" uuid,
	"team_id" uuid,
	"sport_id" uuid,
	"competition_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"lead_minutes" smallint DEFAULT 15 NOT NULL,
	"quiet_hours_start" varchar(5),
	"quiet_hours_end" varchar(5),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_scope_check" CHECK (num_nonnulls("notification_preferences"."athlete_id", "notification_preferences"."team_id", "notification_preferences"."sport_id", "notification_preferences"."competition_id") <= 1),
	CONSTRAINT "notification_preferences_lead_check" CHECK ("notification_preferences"."lead_minutes" between 0 and 1440),
	CONSTRAINT "notification_preferences_quiet_hours_check" CHECK (("notification_preferences"."quiet_hours_start" is null and "notification_preferences"."quiet_hours_end" is null) or ("notification_preferences"."quiet_hours_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "notification_preferences"."quiet_hours_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" uuid,
	"event_id" uuid,
	"athlete_id" uuid,
	"team_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"state" "notification_state" DEFAULT 'pending' NOT NULL,
	"deduplication_key" varchar(240) NOT NULL,
	"locale" varchar(5) NOT NULL,
	"title" varchar(240) NOT NULL,
	"body" text NOT NULL,
	"spoiler_sensitive" boolean DEFAULT false NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failure_code" varchar(100),
	"attempts" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_locale_check" CHECK ("notifications"."locale" in ('et', 'en')),
	CONSTRAINT "notifications_attempts_check" CHECK ("notifications"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aggregate_type" varchar(80) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" varchar(120) NOT NULL,
	"deduplication_key" varchar(240) NOT NULL,
	"payload" jsonb NOT NULL,
	"state" "outbox_state" DEFAULT 'pending' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(120),
	"published_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_attempts_check" CHECK ("outbox_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "playback_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"device_id" uuid,
	"event_id" uuid NOT NULL,
	"stream_id" uuid NOT NULL,
	"entitlement_id" uuid,
	"token_jti_hash" char(64) NOT NULL,
	"state" "playback_state" DEFAULT 'authorized' NOT NULL,
	"country_code" char(2) NOT NULL,
	"started_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"authorization_expires_at" timestamp with time zone NOT NULL,
	"startup_milliseconds" integer,
	"rebuffer_milliseconds" bigint DEFAULT 0 NOT NULL,
	"fatal_error_code" varchar(100),
	"consented_telemetry" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playback_sessions_startup_check" CHECK ("playback_sessions"."startup_milliseconds" is null or "playback_sessions"."startup_milliseconds" >= 0),
	CONSTRAINT "playback_sessions_rebuffer_check" CHECK ("playback_sessions"."rebuffer_milliseconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(80) NOT NULL,
	"kind" "product_kind" NOT NULL,
	"name_et" varchar(160) NOT NULL,
	"name_en" varchar(160) NOT NULL,
	"description_et" text,
	"description_en" text,
	"price_minor" integer NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"billing_interval" "billing_interval" NOT NULL,
	"trial_days" smallint DEFAULT 0 NOT NULL,
	"max_concurrent_streams" smallint DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_code_unique" UNIQUE("code"),
	CONSTRAINT "products_price_check" CHECK ("products"."price_minor" >= 0),
	CONSTRAINT "products_trial_days_check" CHECK ("products"."trial_days" >= 0),
	CONSTRAINT "products_streams_check" CHECK ("products"."max_concurrent_streams" > 0)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"kind" "profile_kind" DEFAULT 'adult' NOT NULL,
	"avatar_key" varchar(80),
	"locale" varchar(5) DEFAULT 'et' NOT NULL,
	"spoiler_free" boolean DEFAULT false NOT NULL,
	"data_saver" boolean DEFAULT false NOT NULL,
	"autoplay" boolean DEFAULT true NOT NULL,
	"maturity_limit" smallint DEFAULT 18 NOT NULL,
	"pin_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_locale_check" CHECK ("profiles"."locale" in ('et', 'en')),
	CONSTRAINT "profiles_maturity_limit_check" CHECK ("profiles"."maturity_limit" between 0 and 18)
);
--> statement-breakpoint
CREATE TABLE "results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"event_participant_id" uuid NOT NULL,
	"rank" integer,
	"score_display" varchar(120),
	"score_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome" varchar(60),
	"is_final" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "results_rank_check" CHECK ("results"."rank" is null or "results"."rank" > 0)
);
--> statement-breakpoint
CREATE TABLE "rights_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid,
	"event_id" uuid,
	"stream_id" uuid,
	"media_asset_id" uuid,
	"content_kind" "content_kind" NOT NULL,
	"country_code" char(2),
	"access" "rights_access" NOT NULL,
	"required_product_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"dvr_allowed" boolean DEFAULT false NOT NULL,
	"recording_allowed" boolean DEFAULT false NOT NULL,
	"max_concurrent_streams" smallint,
	"external_watch_url" text,
	"rights_holder" varchar(180) NOT NULL,
	"contract_reference" varchar(180),
	"priority" smallint DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rights_windows_target_check" CHECK (num_nonnulls("rights_windows"."competition_id", "rights_windows"."event_id", "rights_windows"."stream_id", "rights_windows"."media_asset_id") = 1),
	CONSTRAINT "rights_windows_dates_check" CHECK ("rights_windows"."ends_at" > "rights_windows"."starts_at"),
	CONSTRAINT "rights_windows_entitlement_check" CHECK ("rights_windows"."access" <> 'entitled' or "rights_windows"."required_product_id" is not null),
	CONSTRAINT "rights_windows_external_check" CHECK ("rights_windows"."access" <> 'external_only' or "rights_windows"."external_watch_url" is not null),
	CONSTRAINT "rights_windows_concurrency_check" CHECK ("rights_windows"."max_concurrent_streams" is null or "rights_windows"."max_concurrent_streams" > 0)
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_dates_check" CHECK ("seasons"."ends_at" > "seasons"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid,
	"token_hash" varchar(128) NOT NULL,
	"csrf_secret_hash" varchar(128) NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"rotated_from_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_expiry_check" CHECK ("sessions"."expires_at" > "sessions"."issued_at")
);
--> statement-breakpoint
CREATE TABLE "source_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" uuid NOT NULL,
	"external_id" varchar(240) NOT NULL,
	"external_version" varchar(120),
	"checksum_sha256" char(64),
	"source_updated_at" timestamp with time zone,
	"raw_payload" jsonb,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name_et" varchar(120) NOT NULL,
	"name_en" varchar(120) NOT NULL,
	"icon_key" varchar(80),
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sports_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "stream_renditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stream_id" uuid NOT NULL,
	"label" varchar(40) NOT NULL,
	"width" smallint NOT NULL,
	"height" smallint NOT NULL,
	"video_bitrate_kbps" integer NOT NULL,
	"audio_bitrate_kbps" integer NOT NULL,
	"codec" varchar(80) NOT NULL,
	"frame_rate" numeric(6, 3),
	"is_data_saver" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stream_renditions_dimensions_check" CHECK ("stream_renditions"."width" > 0 and "stream_renditions"."height" > 0),
	CONSTRAINT "stream_renditions_bitrate_check" CHECK ("stream_renditions"."video_bitrate_kbps" > 0 and "stream_renditions"."audio_bitrate_kbps" >= 0)
);
--> statement-breakpoint
CREATE TABLE "streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"protocol" "stream_protocol" NOT NULL,
	"state" "stream_state" DEFAULT 'provisioning' NOT NULL,
	"priority" smallint DEFAULT 100 NOT NULL,
	"playback_locator" text,
	"external_watch_url" text,
	"provider" varchar(100) NOT NULL,
	"provider_stream_ref" varchar(200) NOT NULL,
	"requires_signed_access" boolean DEFAULT true NOT NULL,
	"dvr_window_seconds" integer DEFAULT 0 NOT NULL,
	"captions_available" boolean DEFAULT false NOT NULL,
	"audio_tracks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"last_healthy_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "streams_priority_check" CHECK ("streams"."priority" >= 0),
	CONSTRAINT "streams_dvr_check" CHECK ("streams"."dvr_window_seconds" >= 0),
	CONSTRAINT "streams_locator_check" CHECK (("streams"."protocol" = 'external' and "streams"."external_watch_url" is not null) or ("streams"."protocol" <> 'external' and "streams"."playback_locator" is not null))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"state" "subscription_state" NOT NULL,
	"provider" varchar(80) NOT NULL,
	"provider_customer_ref" varchar(180),
	"provider_subscription_ref" varchar(180),
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_period_check" CHECK ("subscriptions"."current_period_end" > "subscriptions"."current_period_start")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport_id" uuid,
	"slug" varchar(120) NOT NULL,
	"name" varchar(160) NOT NULL,
	"short_name" varchar(40),
	"country_code" char(2) NOT NULL,
	"city" varchar(120),
	"logo_url" text,
	"is_national_team" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"event_clock" varchar(32),
	"kind" timeline_kind NOT NULL,
	"participant_id" uuid,
	"text_et" text,
	"text_en" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"spoiler_sensitive" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timeline_events_sequence_check" CHECK ("timeline_events"."sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"password_hash" text,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"state" "user_state" DEFAULT 'active' NOT NULL,
	"preferred_locale" varchar(5) DEFAULT 'et' NOT NULL,
	"timezone" varchar(64) DEFAULT 'Europe/Tallinn' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"consent_version" varchar(32),
	"analytics_consent_at" timestamp with time zone,
	"deletion_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_locale_check" CHECK ("users"."preferred_locale" in ('et', 'en'))
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(140) NOT NULL,
	"name" varchar(180) NOT NULL,
	"city" varchar(120) NOT NULL,
	"country_code" char(2) NOT NULL,
	"timezone" varchar(64) NOT NULL,
	"address" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venues_slug_unique" UNIQUE("slug"),
	CONSTRAINT "venues_latitude_check" CHECK ("venues"."latitude" is null or "venues"."latitude" between -90 and 90),
	CONSTRAINT "venues_longitude_check" CHECK ("venues"."longitude" is null or "venues"."longitude" between -180 and 180)
);
--> statement-breakpoint
ALTER TABLE "athlete_team_memberships" ADD CONSTRAINT "athlete_team_memberships_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_team_memberships" ADD CONSTRAINT "athlete_team_memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_primary_sport_id_sports_id_fk" FOREIGN KEY ("primary_sport_id") REFERENCES "public"."sports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_collection_items" ADD CONSTRAINT "editorial_collection_items_collection_id_editorial_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."editorial_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_collection_items" ADD CONSTRAINT "editorial_collection_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_collection_items" ADD CONSTRAINT "editorial_collection_items_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_collection_items" ADD CONSTRAINT "editorial_collection_items_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_collection_items" ADD CONSTRAINT "editorial_collection_items_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_collection_items" ADD CONSTRAINT "editorial_collection_items_highlight_id_highlights_id_fk" FOREIGN KEY ("highlight_id") REFERENCES "public"."highlights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_collections" ADD CONSTRAINT "editorial_collections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_sessions" ADD CONSTRAINT "playback_sessions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_sessions" ADD CONSTRAINT "playback_sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_sessions" ADD CONSTRAINT "playback_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_sessions" ADD CONSTRAINT "playback_sessions_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_sessions" ADD CONSTRAINT "playback_sessions_entitlement_id_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_event_participant_id_event_participants_id_fk" FOREIGN KEY ("event_participant_id") REFERENCES "public"."event_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_windows" ADD CONSTRAINT "rights_windows_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_windows" ADD CONSTRAINT "rights_windows_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_windows" ADD CONSTRAINT "rights_windows_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_windows" ADD CONSTRAINT "rights_windows_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_windows" ADD CONSTRAINT "rights_windows_required_product_id_products_id_fk" FOREIGN KEY ("required_product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_source_id_ingestion_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."ingestion_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_renditions" ADD CONSTRAINT "stream_renditions_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streams" ADD CONSTRAINT "streams_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_participant_id_event_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."event_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "athlete_memberships_current_idx" ON "athlete_team_memberships" USING btree ("athlete_id","ends_at");--> statement-breakpoint
CREATE INDEX "athletes_sport_idx" ON "athletes" USING btree ("primary_sport_id");--> statement-breakpoint
CREATE INDEX "athletes_nationality_idx" ON "athletes" USING btree ("nationality_code");--> statement-breakpoint
CREATE INDEX "athletes_display_name_idx" ON "athletes" USING btree ("display_name");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "competitions_sport_idx" ON "competitions" USING btree ("sport_id");--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "devices_last_seen_idx" ON "devices" USING btree ("last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_source_reference_unique" ON "entitlements" USING btree ("source","source_reference");--> statement-breakpoint
CREATE INDEX "entitlements_user_window_idx" ON "entitlements" USING btree ("user_id","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "event_participants_athlete_unique" ON "event_participants" USING btree ("event_id","athlete_id") WHERE "event_participants"."athlete_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "event_participants_team_unique" ON "event_participants" USING btree ("event_id","team_id") WHERE "event_participants"."team_id" is not null;--> statement-breakpoint
CREATE INDEX "event_participants_athlete_idx" ON "event_participants" USING btree ("athlete_id","event_id");--> statement-breakpoint
CREATE INDEX "event_participants_team_idx" ON "event_participants" USING btree ("team_id","event_id");--> statement-breakpoint
CREATE INDEX "events_schedule_idx" ON "events" USING btree ("scheduled_start_at","state");--> statement-breakpoint
CREATE INDEX "events_competition_schedule_idx" ON "events" USING btree ("competition_id","scheduled_start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "follows_profile_athlete_unique" ON "follows" USING btree ("profile_id","athlete_id") WHERE "follows"."athlete_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "follows_profile_team_unique" ON "follows" USING btree ("profile_id","team_id") WHERE "follows"."team_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "follows_profile_sport_unique" ON "follows" USING btree ("profile_id","sport_id") WHERE "follows"."sport_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "follows_profile_competition_unique" ON "follows" USING btree ("profile_id","competition_id") WHERE "follows"."competition_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "highlights_event_asset_unique" ON "highlights" USING btree ("event_id","media_asset_id");--> statement-breakpoint
CREATE INDEX "media_assets_event_kind_idx" ON "media_assets" USING btree ("event_id","kind");--> statement-breakpoint
CREATE INDEX "notification_preferences_profile_idx" ON "notification_preferences" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_deduplication_unique" ON "notifications" USING btree ("deduplication_key");--> statement-breakpoint
CREATE INDEX "notifications_delivery_idx" ON "notifications" USING btree ("state","scheduled_for");--> statement-breakpoint
CREATE INDEX "notifications_profile_inbox_idx" ON "notifications" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_deduplication_unique" ON "outbox_events" USING btree ("deduplication_key");--> statement-breakpoint
CREATE INDEX "outbox_events_delivery_idx" ON "outbox_events" USING btree ("state","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "playback_sessions_jti_unique" ON "playback_sessions" USING btree ("token_jti_hash");--> statement-breakpoint
CREATE INDEX "playback_sessions_concurrency_idx" ON "playback_sessions" USING btree ("profile_id","state","authorization_expires_at");--> statement-breakpoint
CREATE INDEX "playback_sessions_stream_health_idx" ON "playback_sessions" USING btree ("stream_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_user_name_unique" ON "profiles" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "profiles_user_idx" ON "profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "results_event_participant_unique" ON "results" USING btree ("event_id","event_participant_id");--> statement-breakpoint
CREATE INDEX "results_event_rank_idx" ON "results" USING btree ("event_id","rank");--> statement-breakpoint
CREATE INDEX "rights_windows_lookup_idx" ON "rights_windows" USING btree ("event_id","content_kind","country_code","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_competition_name_unique" ON "seasons" USING btree ("competition_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_expires_idx" ON "sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "source_records_external_unique" ON "source_records" USING btree ("source_id","entity_type","external_id");--> statement-breakpoint
CREATE INDEX "source_records_entity_idx" ON "source_records" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stream_renditions_stream_label_unique" ON "stream_renditions" USING btree ("stream_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "streams_provider_ref_unique" ON "streams" USING btree ("provider","provider_stream_ref");--> statement-breakpoint
CREATE INDEX "streams_event_priority_idx" ON "streams" USING btree ("event_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_ref_unique" ON "subscriptions" USING btree ("provider","provider_subscription_ref") WHERE "subscriptions"."provider_subscription_ref" is not null;--> statement-breakpoint
CREATE INDEX "subscriptions_user_state_idx" ON "subscriptions" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "teams_sport_idx" ON "teams" USING btree ("sport_id");--> statement-breakpoint
CREATE INDEX "teams_country_idx" ON "teams" USING btree ("country_code");--> statement-breakpoint
CREATE UNIQUE INDEX "timeline_events_sequence_unique" ON "timeline_events" USING btree ("event_id","sequence");--> statement-breakpoint
CREATE INDEX "timeline_events_event_time_idx" ON "timeline_events" USING btree ("event_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));