import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["viewer", "editor", "operator", "admin"]);
export const userState = pgEnum("user_state", [
  "active",
  "invited",
  "suspended",
  "deletion_requested",
]);
export const profileKind = pgEnum("profile_kind", ["adult", "child"]);
export const devicePlatform = pgEnum("device_platform", ["web", "ios", "android", "tv", "other"]);
export const productKind = pgEnum("product_kind", [
  "subscription",
  "event_pass",
  "competition_pass",
  "trial",
  "voucher",
]);
export const billingInterval = pgEnum("billing_interval", ["one_time", "month", "year"]);
export const subscriptionState = pgEnum("subscription_state", [
  "trialing",
  "active",
  "past_due",
  "paused",
  "cancelled",
  "expired",
]);
export const entitlementSource = pgEnum("entitlement_source", [
  "subscription",
  "purchase",
  "voucher",
  "trial",
  "grant",
]);
export const eventState = pgEnum("event_state", [
  "scheduled",
  "delayed",
  "live",
  "paused",
  "finished",
  "cancelled",
]);
export const participantRole = pgEnum("participant_role", ["competitor", "home", "away"]);
export const mediaAssetKind = pgEnum("media_asset_kind", [
  "recording",
  "replay",
  "highlight",
  "poster",
  "thumbnail",
  "caption",
  "audio_description",
]);
export const mediaAssetState = pgEnum("media_asset_state", [
  "pending",
  "processing",
  "ready",
  "failed",
  "expired",
]);
export const streamProtocol = pgEnum("stream_protocol", ["webrtc", "ll_hls", "hls", "external"]);
export const streamState = pgEnum("stream_state", [
  "provisioning",
  "ready",
  "live",
  "degraded",
  "ended",
  "unavailable",
]);
export const mediaProviderResourceState = pgEnum("media_provider_resource_state", [
  "absent",
  "provisioned",
  "encoding",
  "published",
  "stopped",
  "failed",
]);
export const mediaProviderOperationAction = pgEnum("media_provider_operation_action", [
  "provision",
  "start",
  "publish",
  "unpublish",
  "stop",
  "refresh",
]);
export const mediaProviderOperationState = pgEnum("media_provider_operation_state", [
  "pending",
  "succeeded",
  "failed",
]);
export const contentKind = pgEnum("content_kind", ["live", "replay", "highlight"]);
export const rightsAccess = pgEnum("rights_access", [
  "free",
  "entitled",
  "external_only",
  "unavailable",
]);
export const notificationChannel = pgEnum("notification_channel", ["in_app", "push", "email"]);
export const notificationKind = pgEnum("notification_kind", [
  "event_starting_soon",
  "event_started",
  "schedule_changed",
  "venue_changed",
  "followed_athlete_competing",
  "important_result",
  "highlight_available",
]);
export const notificationState = pgEnum("notification_state", [
  "pending",
  "sent",
  "failed",
  "cancelled",
]);
export const timelineKind = pgEnum("timeline_kind", [
  "period_start",
  "period_end",
  "score",
  "penalty",
  "substitution",
  "commentary",
  "result",
  "other",
]);
export const editorialState = pgEnum("editorial_state", [
  "draft",
  "scheduled",
  "published",
  "archived",
]);
export const playbackState = pgEnum("playback_state", [
  "authorized",
  "playing",
  "ended",
  "revoked",
]);
export const ingestionKind = pgEnum("ingestion_kind", ["schedule", "results", "media", "manual"]);
export const outboxState = pgEnum("outbox_state", ["pending", "processing", "published", "failed"]);
export const demoBroadcastState = pgEnum("demo_broadcast_state", [
  "created",
  "offer_ready",
  "viewer_claimed",
  "connected",
]);

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    passwordHash: text("password_hash"),
    role: userRole("role").default("viewer").notNull(),
    state: userState("state").default("active").notNull(),
    preferredLocale: varchar("preferred_locale", { length: 5 }).default("et").notNull(),
    timezone: varchar("timezone", { length: 64 }).default("Europe/Tallinn").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, mode: "date" }),
    consentVersion: varchar("consent_version", { length: 32 }),
    analyticsConsentAt: timestamp("analytics_consent_at", { withTimezone: true, mode: "date" }),
    deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true, mode: "date" }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`),
    check("users_locale_check", sql`${table.preferredLocale} in ('et', 'en')`),
  ],
);

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    kind: profileKind("kind").default("adult").notNull(),
    avatarKey: varchar("avatar_key", { length: 80 }),
    locale: varchar("locale", { length: 5 }).default("et").notNull(),
    spoilerFree: boolean("spoiler_free").default(false).notNull(),
    dataSaver: boolean("data_saver").default(false).notNull(),
    autoplay: boolean("autoplay").default(true).notNull(),
    maturityLimit: smallint("maturity_limit").default(18).notNull(),
    pinHash: text("pin_hash"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("profiles_user_name_unique").on(table.userId, table.name),
    index("profiles_user_idx").on(table.userId),
    check("profiles_locale_check", sql`${table.locale} in ('et', 'en')`),
    check("profiles_maturity_limit_check", sql`${table.maturityLimit} between 0 and 18`),
  ],
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: devicePlatform("platform").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    deviceFingerprintHash: varchar("device_fingerprint_hash", { length: 128 }),
    pushTokenCiphertext: text("push_token_ciphertext"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    ...timestamps(),
  },
  (table) => [
    index("devices_user_idx").on(table.userId),
    index("devices_last_seen_idx").on(table.lastSeenAt),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    csrfSecretHash: varchar("csrf_secret_hash", { length: 128 }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    rotatedFromId: uuid("rotated_from_id"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_expires_idx").on(table.userId, table.expiresAt),
    check("sessions_expiry_check", sql`${table.expiresAt} > ${table.issuedAt}`),
  ],
);

/**
 * Development-only, short-lived WebRTC signaling state. Raw access tokens are
 * returned once and never persisted; SDP is removed with the row on expiry or
 * explicit publisher deletion.
 */
export const demoBroadcasts = pgTable(
  "demo_broadcasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: char("code", { length: 8 }).notNull(),
    locale: varchar("locale", { length: 5 }).notNull(),
    state: demoBroadcastState("state").default("created").notNull(),
    publisherTokenHash: char("publisher_token_hash", { length: 64 }).notNull(),
    viewerTokenHash: char("viewer_token_hash", { length: 64 }),
    offerSdp: text("offer_sdp"),
    offerSdpHash: char("offer_sdp_hash", { length: 64 }),
    answerSdp: text("answer_sdp"),
    answerSdpHash: char("answer_sdp_hash", { length: 64 }),
    viewerClaimedAt: timestamp("viewer_claimed_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    version: integer("version").default(1).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("demo_broadcasts_code_unique").on(table.code),
    index("demo_broadcasts_expiry_idx").on(table.expiresAt),
    index("demo_broadcasts_state_expiry_idx").on(table.state, table.expiresAt),
    check("demo_broadcasts_code_check", sql`${table.code} ~ '^[0-9A-HJKMNP-TV-Z]{8}$'`),
    check("demo_broadcasts_locale_check", sql`${table.locale} in ('et', 'en')`),
    check(
      "demo_broadcasts_publisher_hash_check",
      sql`${table.publisherTokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "demo_broadcasts_viewer_hash_check",
      sql`${table.viewerTokenHash} is null or ${table.viewerTokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "demo_broadcasts_offer_pair_check",
      sql`(${table.offerSdp} is null) = (${table.offerSdpHash} is null)`,
    ),
    check(
      "demo_broadcasts_answer_pair_check",
      sql`(${table.answerSdp} is null) = (${table.answerSdpHash} is null)`,
    ),
    check(
      "demo_broadcasts_viewer_pair_check",
      sql`(${table.viewerTokenHash} is null) = (${table.viewerClaimedAt} is null)`,
    ),
    check("demo_broadcasts_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
    check("demo_broadcasts_version_check", sql`${table.version} > 0`),
    check(
      "demo_broadcasts_state_check",
      sql`(
        (${table.state} = 'created' and ${table.offerSdp} is null and ${table.viewerTokenHash} is null and ${table.answerSdp} is null)
        or (${table.state} = 'offer_ready' and ${table.offerSdp} is not null and ${table.viewerTokenHash} is null and ${table.answerSdp} is null)
        or (${table.state} = 'viewer_claimed' and ${table.offerSdp} is not null and ${table.viewerTokenHash} is not null and ${table.answerSdp} is null)
        or (${table.state} = 'connected' and ${table.offerSdp} is not null and ${table.viewerTokenHash} is not null and ${table.answerSdp} is not null)
      )`,
    ),
  ],
);

export const sports = pgTable("sports", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  nameEt: varchar("name_et", { length: 120 }).notNull(),
  nameEn: varchar("name_en", { length: 120 }).notNull(),
  iconKey: varchar("icon_key", { length: 80 }),
  isFeatured: boolean("is_featured").default(false).notNull(),
  ...timestamps(),
});

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sportId: uuid("sport_id").references(() => sports.id, { onDelete: "set null" }),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    name: varchar("name", { length: 160 }).notNull(),
    shortName: varchar("short_name", { length: 40 }),
    countryCode: char("country_code", { length: 2 }).notNull(),
    city: varchar("city", { length: 120 }),
    logoUrl: text("logo_url"),
    isNationalTeam: boolean("is_national_team").default(false).notNull(),
    isDemo: boolean("is_demo").default(false).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("teams_sport_idx").on(table.sportId),
    index("teams_country_idx").on(table.countryCode),
  ],
);

export const athletes = pgTable(
  "athletes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    primarySportId: uuid("primary_sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "restrict" }),
    slug: varchar("slug", { length: 140 }).notNull().unique(),
    givenName: varchar("given_name", { length: 100 }).notNull(),
    familyName: varchar("family_name", { length: 100 }).notNull(),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    nationalityCode: char("nationality_code", { length: 2 }).notNull(),
    birthDate: timestamp("birth_date", { withTimezone: false, mode: "date" }),
    portraitUrl: text("portrait_url"),
    biographyEt: text("biography_et"),
    biographyEn: text("biography_en"),
    keyFacts: jsonb("key_facts")
      .$type<Array<{ labelEt: string; labelEn: string; value: string }>>()
      .default([])
      .notNull(),
    isDemo: boolean("is_demo").default(false).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("athletes_sport_idx").on(table.primarySportId),
    index("athletes_nationality_idx").on(table.nationalityCode),
    index("athletes_display_name_idx").on(table.displayName),
  ],
);

export const athleteTeamMemberships = pgTable(
  "athlete_team_memberships",
  {
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    shirtNumber: varchar("shirt_number", { length: 12 }),
    isPrimary: boolean("is_primary").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.athleteId, table.teamId, table.startsAt] }),
    index("athlete_memberships_current_idx").on(table.athleteId, table.endsAt),
    check(
      "athlete_memberships_dates_check",
      sql`${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

export const competitions = pgTable(
  "competitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "restrict" }),
    slug: varchar("slug", { length: 140 }).notNull().unique(),
    name: varchar("name", { length: 200 }).notNull(),
    nameEt: varchar("name_et", { length: 200 }),
    nameEn: varchar("name_en", { length: 200 }),
    organizer: varchar("organizer", { length: 180 }),
    countryCode: char("country_code", { length: 2 }),
    logoUrl: text("logo_url"),
    isDemo: boolean("is_demo").default(false).notNull(),
    ...timestamps(),
  },
  (table) => [index("competitions_sport_idx").on(table.sportId)],
);

export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    isCurrent: boolean("is_current").default(false).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("seasons_competition_name_unique").on(table.competitionId, table.name),
    check("seasons_dates_check", sql`${table.endsAt} > ${table.startsAt}`),
  ],
);

export const venues = pgTable(
  "venues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 140 }).notNull().unique(),
    name: varchar("name", { length: 180 }).notNull(),
    city: varchar("city", { length: 120 }).notNull(),
    countryCode: char("country_code", { length: 2 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    address: text("address"),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    isDemo: boolean("is_demo").default(false).notNull(),
    ...timestamps(),
  },
  (table) => [
    check(
      "venues_latitude_check",
      sql`${table.latitude} is null or ${table.latitude} between -90 and 90`,
    ),
    check(
      "venues_longitude_check",
      sql`${table.longitude} is null or ${table.longitude} between -180 and 180`,
    ),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "restrict" }),
    seasonId: uuid("season_id").references(() => seasons.id, { onDelete: "set null" }),
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "set null" }),
    slug: varchar("slug", { length: 180 }).notNull().unique(),
    titleEt: varchar("title_et", { length: 240 }).notNull(),
    titleEn: varchar("title_en", { length: 240 }).notNull(),
    descriptionEt: text("description_et"),
    descriptionEn: text("description_en"),
    state: eventState("state").default("scheduled").notNull(),
    scheduledStartAt: timestamp("scheduled_start_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    actualStartAt: timestamp("actual_start_at", { withTimezone: true, mode: "date" }),
    endAt: timestamp("end_at", { withTimezone: true, mode: "date" }),
    originalStartAt: timestamp("original_start_at", { withTimezone: true, mode: "date" }),
    statusDetailEt: varchar("status_detail_et", { length: 240 }),
    statusDetailEn: varchar("status_detail_en", { length: 240 }),
    ageRating: smallint("age_rating").default(0).notNull(),
    scoreVisibility: boolean("score_visibility").default(true).notNull(),
    isDemo: boolean("is_demo").default(false).notNull(),
    version: integer("version").default(1).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("events_schedule_idx").on(table.scheduledStartAt, table.state),
    index("events_competition_schedule_idx").on(table.competitionId, table.scheduledStartAt),
    check(
      "events_end_check",
      sql`${table.endAt} is null or ${table.endAt} > coalesce(${table.actualStartAt}, ${table.scheduledStartAt})`,
    ),
    check("events_age_rating_check", sql`${table.ageRating} between 0 and 18`),
    check("events_version_check", sql`${table.version} > 0`),
  ],
);

export const eventParticipants = pgTable(
  "event_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").references(() => athletes.id, { onDelete: "restrict" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "restrict" }),
    role: participantRole("role").default("competitor").notNull(),
    seed: smallint("seed"),
    laneOrPosition: varchar("lane_or_position", { length: 60 }),
    isEstonian: boolean("is_estonian").default(false).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("event_participants_athlete_unique")
      .on(table.eventId, table.athleteId)
      .where(sql`${table.athleteId} is not null`),
    uniqueIndex("event_participants_team_unique")
      .on(table.eventId, table.teamId)
      .where(sql`${table.teamId} is not null`),
    index("event_participants_athlete_idx").on(table.athleteId, table.eventId),
    index("event_participants_team_idx").on(table.teamId, table.eventId),
    check(
      "event_participants_exactly_one_check",
      sql`num_nonnulls(${table.athleteId}, ${table.teamId}) = 1`,
    ),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 80 }).notNull().unique(),
    kind: productKind("kind").notNull(),
    nameEt: varchar("name_et", { length: 160 }).notNull(),
    nameEn: varchar("name_en", { length: 160 }).notNull(),
    descriptionEt: text("description_et"),
    descriptionEn: text("description_en"),
    priceMinor: integer("price_minor").notNull(),
    currency: char("currency", { length: 3 }).default("EUR").notNull(),
    billingInterval: billingInterval("billing_interval").notNull(),
    trialDays: smallint("trial_days").default(0).notNull(),
    maxConcurrentStreams: smallint("max_concurrent_streams").default(1).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    ...timestamps(),
  },
  (table) => [
    check("products_price_check", sql`${table.priceMinor} >= 0`),
    check("products_trial_days_check", sql`${table.trialDays} >= 0`),
    check("products_streams_check", sql`${table.maxConcurrentStreams} > 0`),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    state: subscriptionState("state").notNull(),
    provider: varchar("provider", { length: 80 }).notNull(),
    providerCustomerRef: varchar("provider_customer_ref", { length: 180 }),
    providerSubscriptionRef: varchar("provider_subscription_ref", { length: 180 }),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("subscriptions_provider_ref_unique")
      .on(table.provider, table.providerSubscriptionRef)
      .where(sql`${table.providerSubscriptionRef} is not null`),
    index("subscriptions_user_state_idx").on(table.userId, table.state),
    check(
      "subscriptions_period_check",
      sql`${table.currentPeriodEnd} > ${table.currentPeriodStart}`,
    ),
  ],
);

export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    source: entitlementSource("source").notNull(),
    sourceReference: varchar("source_reference", { length: 180 }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("entitlements_source_reference_unique").on(table.source, table.sourceReference),
    index("entitlements_user_window_idx").on(table.userId, table.startsAt, table.endsAt),
    check("entitlements_dates_check", sql`${table.endsAt} > ${table.startsAt}`),
  ],
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    kind: mediaAssetKind("kind").notNull(),
    state: mediaAssetState("state").default("pending").notNull(),
    titleEt: varchar("title_et", { length: 240 }),
    titleEn: varchar("title_en", { length: 240 }),
    storageKey: text("storage_key"),
    providerReference: varchar("provider_reference", { length: 200 }),
    mimeType: varchar("mime_type", { length: 120 }),
    durationSeconds: integer("duration_seconds"),
    language: varchar("language", { length: 12 }),
    checksumSha256: char("checksum_sha256", { length: 64 }),
    spoilerSensitive: boolean("spoiler_sensitive").default(false).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    isDemo: boolean("is_demo").default(false).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("media_assets_event_kind_idx").on(table.eventId, table.kind),
    check(
      "media_assets_duration_check",
      sql`${table.durationSeconds} is null or ${table.durationSeconds} >= 0`,
    ),
    check(
      "media_assets_availability_check",
      sql`${table.expiresAt} is null or ${table.availableAt} is null or ${table.expiresAt} > ${table.availableAt}`,
    ),
  ],
);

export const streams = pgTable(
  "streams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    protocol: streamProtocol("protocol").notNull(),
    state: streamState("state").default("provisioning").notNull(),
    priority: smallint("priority").default(100).notNull(),
    playbackLocator: text("playback_locator"),
    externalWatchUrl: text("external_watch_url"),
    provider: varchar("provider", { length: 100 }).notNull(),
    providerStreamRef: varchar("provider_stream_ref", { length: 200 }).notNull(),
    requiresSignedAccess: boolean("requires_signed_access").default(true).notNull(),
    dvrWindowSeconds: integer("dvr_window_seconds").default(0).notNull(),
    captionsAvailable: boolean("captions_available").default(false).notNull(),
    audioTracks: jsonb("audio_tracks")
      .$type<Array<{ id: string; language: string; label: string }>>()
      .default([])
      .notNull(),
    isDemo: boolean("is_demo").default(false).notNull(),
    lastHealthyAt: timestamp("last_healthy_at", { withTimezone: true, mode: "date" }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("streams_provider_ref_unique").on(table.provider, table.providerStreamRef),
    index("streams_event_priority_idx").on(table.eventId, table.priority),
    check("streams_priority_check", sql`${table.priority} >= 0`),
    check("streams_dvr_check", sql`${table.dvrWindowSeconds} >= 0`),
    check(
      "streams_locator_check",
      sql`(${table.protocol} = 'external' and ${table.externalWatchUrl} is not null) or (${table.protocol} <> 'external' and ${table.playbackLocator} is not null)`,
    ),
  ],
);

export const streamRenditions = pgTable(
  "stream_renditions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    streamId: uuid("stream_id")
      .notNull()
      .references(() => streams.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 40 }).notNull(),
    width: smallint("width").notNull(),
    height: smallint("height").notNull(),
    videoBitrateKbps: integer("video_bitrate_kbps").notNull(),
    audioBitrateKbps: integer("audio_bitrate_kbps").notNull(),
    codec: varchar("codec", { length: 80 }).notNull(),
    frameRate: numeric("frame_rate", { precision: 6, scale: 3 }),
    isDataSaver: boolean("is_data_saver").default(false).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("stream_renditions_stream_label_unique").on(table.streamId, table.label),
    check("stream_renditions_dimensions_check", sql`${table.width} > 0 and ${table.height} > 0`),
    check(
      "stream_renditions_bitrate_check",
      sql`${table.videoBitrateKbps} > 0 and ${table.audioBitrateKbps} >= 0`,
    ),
  ],
);

export const mediaProviderResources = pgTable(
  "media_provider_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    streamId: uuid("stream_id")
      .notNull()
      .unique()
      .references(() => streams.id, { onDelete: "cascade" }),
    providerKey: varchar("provider_key", { length: 100 }).notNull(),
    providerResourceId: varchar("provider_resource_id", { length: 200 }).notNull(),
    desiredState: mediaProviderResourceState("desired_state").default("absent").notNull(),
    observedState: mediaProviderResourceState("observed_state").default("absent").notNull(),
    playbackLocator: text("playback_locator"),
    generation: integer("generation").default(1).notNull(),
    lastHealthyAt: timestamp("last_healthy_at", { withTimezone: true, mode: "date" }),
    lastErrorCode: varchar("last_error_code", { length: 120 }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("media_provider_resources_provider_ref_unique").on(
      table.providerKey,
      table.providerResourceId,
    ),
    index("media_provider_resources_observed_state_idx").on(table.observedState, table.updatedAt),
    check("media_provider_resources_generation_check", sql`${table.generation} > 0`),
  ],
);

export const mediaProviderOperations = pgTable(
  "media_provider_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    streamId: uuid("stream_id")
      .notNull()
      .references(() => streams.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id").references(() => mediaProviderResources.id, {
      onDelete: "set null",
    }),
    action: mediaProviderOperationAction("action").notNull(),
    state: mediaProviderOperationState("state").default("pending").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 180 }).notNull(),
    requestHash: char("request_hash", { length: 64 }).notNull(),
    reason: text("reason").notNull(),
    attempts: smallint("attempts").default(0).notNull(),
    providerRequestId: varchar("provider_request_id", { length: 180 }),
    safeResult: jsonb("safe_result").$type<Record<string, unknown>>(),
    errorCode: varchar("error_code", { length: 120 }),
    requestedAt: timestamp("requested_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("media_provider_operations_idempotency_unique").on(table.idempotencyKey),
    uniqueIndex("media_provider_operations_one_pending_per_stream")
      .on(table.streamId)
      .where(sql`${table.state} = 'pending'`),
    index("media_provider_operations_stream_requested_idx").on(table.streamId, table.requestedAt),
    check("media_provider_operations_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

export const rightsWindows = pgTable(
  "rights_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id").references(() => competitions.id, {
      onDelete: "cascade",
    }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    streamId: uuid("stream_id").references(() => streams.id, { onDelete: "cascade" }),
    mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, { onDelete: "cascade" }),
    contentKind: contentKind("content_kind").notNull(),
    countryCode: char("country_code", { length: 2 }),
    access: rightsAccess("access").notNull(),
    requiredProductId: uuid("required_product_id").references(() => products.id, {
      onDelete: "restrict",
    }),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    dvrAllowed: boolean("dvr_allowed").default(false).notNull(),
    recordingAllowed: boolean("recording_allowed").default(false).notNull(),
    maxConcurrentStreams: smallint("max_concurrent_streams"),
    externalWatchUrl: text("external_watch_url"),
    rightsHolder: varchar("rights_holder", { length: 180 }).notNull(),
    contractReference: varchar("contract_reference", { length: 180 }),
    priority: smallint("priority").default(100).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("rights_windows_lookup_idx").on(
      table.eventId,
      table.contentKind,
      table.countryCode,
      table.startsAt,
      table.endsAt,
    ),
    check(
      "rights_windows_target_check",
      sql`num_nonnulls(${table.competitionId}, ${table.eventId}, ${table.streamId}, ${table.mediaAssetId}) = 1`,
    ),
    check("rights_windows_dates_check", sql`${table.endsAt} > ${table.startsAt}`),
    check(
      "rights_windows_entitlement_check",
      sql`${table.access} <> 'entitled' or ${table.requiredProductId} is not null`,
    ),
    check(
      "rights_windows_external_check",
      sql`${table.access} <> 'external_only' or ${table.externalWatchUrl} is not null`,
    ),
    check(
      "rights_windows_concurrency_check",
      sql`${table.maxConcurrentStreams} is null or ${table.maxConcurrentStreams} > 0`,
    ),
  ],
);

export const follows = pgTable(
  "follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").references(() => athletes.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    sportId: uuid("sport_id").references(() => sports.id, { onDelete: "cascade" }),
    competitionId: uuid("competition_id").references(() => competitions.id, {
      onDelete: "cascade",
    }),
    notificationsEnabled: boolean("notifications_enabled").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("follows_profile_athlete_unique")
      .on(table.profileId, table.athleteId)
      .where(sql`${table.athleteId} is not null`),
    uniqueIndex("follows_profile_team_unique")
      .on(table.profileId, table.teamId)
      .where(sql`${table.teamId} is not null`),
    uniqueIndex("follows_profile_sport_unique")
      .on(table.profileId, table.sportId)
      .where(sql`${table.sportId} is not null`),
    uniqueIndex("follows_profile_competition_unique")
      .on(table.profileId, table.competitionId)
      .where(sql`${table.competitionId} is not null`),
    check(
      "follows_exactly_one_check",
      sql`num_nonnulls(${table.athleteId}, ${table.teamId}, ${table.sportId}, ${table.competitionId}) = 1`,
    ),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    channel: notificationChannel("channel").notNull(),
    kind: notificationKind("kind").notNull(),
    athleteId: uuid("athlete_id").references(() => athletes.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    sportId: uuid("sport_id").references(() => sports.id, { onDelete: "cascade" }),
    competitionId: uuid("competition_id").references(() => competitions.id, {
      onDelete: "cascade",
    }),
    enabled: boolean("enabled").default(true).notNull(),
    leadMinutes: smallint("lead_minutes").default(15).notNull(),
    quietHoursStart: varchar("quiet_hours_start", { length: 5 }),
    quietHoursEnd: varchar("quiet_hours_end", { length: 5 }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("notification_preferences_global_unique")
      .on(table.profileId, table.channel, table.kind)
      .where(
        sql`${table.athleteId} is null and ${table.teamId} is null and ${table.sportId} is null and ${table.competitionId} is null`,
      ),
    uniqueIndex("notification_preferences_athlete_unique")
      .on(table.profileId, table.channel, table.kind, table.athleteId)
      .where(sql`${table.athleteId} is not null`),
    uniqueIndex("notification_preferences_team_unique")
      .on(table.profileId, table.channel, table.kind, table.teamId)
      .where(sql`${table.teamId} is not null`),
    uniqueIndex("notification_preferences_sport_unique")
      .on(table.profileId, table.channel, table.kind, table.sportId)
      .where(sql`${table.sportId} is not null`),
    uniqueIndex("notification_preferences_competition_unique")
      .on(table.profileId, table.channel, table.kind, table.competitionId)
      .where(sql`${table.competitionId} is not null`),
    index("notification_preferences_profile_idx").on(table.profileId),
    check(
      "notification_preferences_scope_check",
      sql`num_nonnulls(${table.athleteId}, ${table.teamId}, ${table.sportId}, ${table.competitionId}) <= 1`,
    ),
    check("notification_preferences_lead_check", sql`${table.leadMinutes} between 0 and 1440`),
    check(
      "notification_preferences_quiet_hours_check",
      sql`(${table.quietHoursStart} is null and ${table.quietHoursEnd} is null) or (${table.quietHoursStart} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${table.quietHoursEnd} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`,
    ),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").references(() => athletes.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    channel: notificationChannel("channel").notNull(),
    kind: notificationKind("kind").notNull(),
    state: notificationState("state").default("pending").notNull(),
    deduplicationKey: varchar("deduplication_key", { length: 240 }).notNull(),
    locale: varchar("locale", { length: 5 }).notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    body: text("body").notNull(),
    spoilerSensitive: boolean("spoiler_sensitive").default(false).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true, mode: "date" }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    failureCode: varchar("failure_code", { length: 100 }),
    attempts: smallint("attempts").default(0).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("notifications_deduplication_unique").on(table.deduplicationKey),
    index("notifications_delivery_idx").on(table.state, table.scheduledFor),
    index("notifications_profile_inbox_idx").on(table.profileId, table.createdAt),
    check("notifications_locale_check", sql`${table.locale} in ('et', 'en')`),
    check("notifications_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

export const results = pgTable(
  "results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    eventParticipantId: uuid("event_participant_id")
      .notNull()
      .references(() => eventParticipants.id, { onDelete: "cascade" }),
    rank: integer("rank"),
    scoreDisplay: varchar("score_display", { length: 120 }),
    scoreData: jsonb("score_data")
      .$type<Record<string, string | number | boolean | null>>()
      .default({})
      .notNull(),
    outcome: varchar("outcome", { length: 60 }),
    isFinal: boolean("is_final").default(false).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("results_event_participant_unique").on(table.eventId, table.eventParticipantId),
    index("results_event_rank_idx").on(table.eventId, table.rank),
    check("results_rank_check", sql`${table.rank} is null or ${table.rank} > 0`),
  ],
);

export const timelineEvents = pgTable(
  "timeline_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(),
    eventClock: varchar("event_clock", { length: 32 }),
    kind: timelineKind("kind").notNull(),
    participantId: uuid("participant_id").references(() => eventParticipants.id, {
      onDelete: "set null",
    }),
    textEt: text("text_et"),
    textEn: text("text_en"),
    data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
    spoilerSensitive: boolean("spoiler_sensitive").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("timeline_events_sequence_unique").on(table.eventId, table.sequence),
    index("timeline_events_event_time_idx").on(table.eventId, table.occurredAt),
    check("timeline_events_sequence_check", sql`${table.sequence} >= 0`),
  ],
);

export const highlights = pgTable(
  "highlights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    titleEt: varchar("title_et", { length: 240 }).notNull(),
    titleEn: varchar("title_en", { length: 240 }).notNull(),
    startOffsetSeconds: integer("start_offset_seconds").default(0).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    spoilerSensitive: boolean("spoiler_sensitive").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("highlights_event_asset_unique").on(table.eventId, table.mediaAssetId),
    check(
      "highlights_offsets_check",
      sql`${table.startOffsetSeconds} >= 0 and ${table.durationSeconds} > 0`,
    ),
  ],
);

export const editorialCollections = pgTable(
  "editorial_collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 140 }).notNull().unique(),
    titleEt: varchar("title_et", { length: 240 }).notNull(),
    titleEn: varchar("title_en", { length: 240 }).notNull(),
    descriptionEt: text("description_et"),
    descriptionEn: text("description_en"),
    state: editorialState("state").default("draft").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    check(
      "editorial_collections_dates_check",
      sql`${table.endsAt} is null or ${table.startsAt} is null or ${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

export const editorialCollectionItems = pgTable(
  "editorial_collection_items",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => editorialCollections.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").references(() => athletes.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    competitionId: uuid("competition_id").references(() => competitions.id, {
      onDelete: "cascade",
    }),
    highlightId: uuid("highlight_id").references(() => highlights.id, { onDelete: "cascade" }),
    labelEt: varchar("label_et", { length: 160 }),
    labelEn: varchar("label_en", { length: 160 }),
    ...timestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.position] }),
    check("editorial_collection_items_position_check", sql`${table.position} >= 0`),
    check(
      "editorial_collection_items_target_check",
      sql`num_nonnulls(${table.eventId}, ${table.athleteId}, ${table.teamId}, ${table.competitionId}, ${table.highlightId}) = 1`,
    ),
  ],
);

export const playbackSessions = pgTable(
  "playback_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    streamId: uuid("stream_id")
      .notNull()
      .references(() => streams.id, { onDelete: "cascade" }),
    entitlementId: uuid("entitlement_id").references(() => entitlements.id, {
      onDelete: "set null",
    }),
    tokenJtiHash: char("token_jti_hash", { length: 64 }).notNull(),
    state: playbackState("state").default("authorized").notNull(),
    countryCode: char("country_code", { length: 2 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true, mode: "date" }),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    authorizationExpiresAt: timestamp("authorization_expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    startupMilliseconds: integer("startup_milliseconds"),
    rebufferMilliseconds: bigint("rebuffer_milliseconds", { mode: "number" }).default(0).notNull(),
    fatalErrorCode: varchar("fatal_error_code", { length: 100 }),
    consentedTelemetry: boolean("consented_telemetry").default(false).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("playback_sessions_jti_unique").on(table.tokenJtiHash),
    index("playback_sessions_concurrency_idx").on(
      table.profileId,
      table.state,
      table.authorizationExpiresAt,
    ),
    index("playback_sessions_stream_health_idx").on(table.streamId, table.createdAt),
    check(
      "playback_sessions_startup_check",
      sql`${table.startupMilliseconds} is null or ${table.startupMilliseconds} >= 0`,
    ),
    check("playback_sessions_rebuffer_check", sql`${table.rebufferMilliseconds} >= 0`),
  ],
);

export const ingestionSources = pgTable("ingestion_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  kind: ingestionKind("kind").notNull(),
  baseUrl: text("base_url"),
  isActive: boolean("is_active").default(true).notNull(),
  trustPriority: smallint("trust_priority").default(100).notNull(),
  lastSuccessfulSyncAt: timestamp("last_successful_sync_at", { withTimezone: true, mode: "date" }),
  ...timestamps(),
});

export const sourceRecords = pgTable(
  "source_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => ingestionSources.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    externalId: varchar("external_id", { length: 240 }).notNull(),
    externalVersion: varchar("external_version", { length: 120 }),
    checksumSha256: char("checksum_sha256", { length: 64 }),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true, mode: "date" }),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("source_records_external_unique").on(
      table.sourceId,
      table.entityType,
      table.externalId,
    ),
    index("source_records_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    requestId: varchar("request_id", { length: 120 }),
    reason: text("reason"),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    ipHash: char("ip_hash", { length: 64 }),
    userAgentSummary: varchar("user_agent_summary", { length: 240 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.entityType, table.entityId, table.occurredAt),
    index("audit_logs_actor_idx").on(table.actorUserId, table.occurredAt),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aggregateType: varchar("aggregate_type", { length: 80 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    deduplicationKey: varchar("deduplication_key", { length: 240 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    state: outboxState("state").default("pending").notNull(),
    availableAt: timestamp("available_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    attempts: smallint("attempts").default(0).notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    lockedBy: varchar("locked_by", { length: 120 }),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    lastError: text("last_error"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("outbox_events_deduplication_unique").on(table.deduplicationKey),
    index("outbox_events_delivery_idx").on(table.state, table.availableAt),
    check("outbox_events_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Athlete = typeof athletes.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Sport = typeof sports.$inferSelect;
export type Competition = typeof competitions.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Stream = typeof streams.$inferSelect;
export type MediaProviderResource = typeof mediaProviderResources.$inferSelect;
export type MediaProviderOperation = typeof mediaProviderOperations.$inferSelect;
export type RightsWindow = typeof rightsWindows.$inferSelect;
export type Follow = typeof follows.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type DemoBroadcast = typeof demoBroadcasts.$inferSelect;
