ALTER TABLE "live_broadcasts" DROP CONSTRAINT "live_broadcasts_provider_check";--> statement-breakpoint
ALTER TABLE "live_broadcasts" DROP CONSTRAINT "live_broadcasts_playback_url_check";--> statement-breakpoint
ALTER TABLE "live_broadcasts" ADD CONSTRAINT "live_broadcasts_provider_check" CHECK ("live_broadcasts"."provider" in ('cloudflare-stream', 'livekit-cloud'));--> statement-breakpoint
ALTER TABLE "live_broadcasts" ADD CONSTRAINT "live_broadcasts_playback_url_check" CHECK ((
        ("live_broadcasts"."provider" = 'cloudflare-stream' and "live_broadcasts"."playback_url" like 'https://%')
        or ("live_broadcasts"."provider" = 'livekit-cloud' and "live_broadcasts"."playback_url" like 'wss://%')
      ));