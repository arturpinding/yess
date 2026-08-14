# RADA architecture

Last reviewed: 2026-08-14

## Decision

RADA starts as a strongly typed modular monolith: Next.js 16 and React 19 for the web application and HTTP API, PostgreSQL 17 for durable state, Drizzle ORM for schema/migrations, and TypeScript across browser and server code. The player is an isolated browser module built on native media APIs, `hls.js`, and an injectable WHEP/WebRTC connector.

This is an intentional first-production architecture, not an assertion that one process can run an entire broadcaster. It keeps cross-cutting policies—rights, entitlements, profiles, follows, schedules, and notifications—in one transactional boundary while traffic and team size are small. The boundaries below allow notification delivery, ingestion, and playback authorization to move into separate services without rewriting the product model.

## Runtime view

```text
Browser / PWA-capable web client
  |-- server-rendered discovery and session-owned personalization
  |-- anonymous requests receive an empty personalization scope
  |-- authenticated JSON mutations
  |-- SportsPlayer: WHEP -> LL-HLS -> HLS -> official external destination
  |
Next.js application (control plane)
  |-- route/page composition
  |-- authentication + profile context
  |-- schedule/search/follow business logic
  |-- rights + entitlement decision point
  |-- short-lived playback authorization
  |-- notification planning and inbox
  |-- development-only read-only admin view (hard-404 in production)
  |
PostgreSQL
  |-- catalogue, schedules, follows, rights, entitlements
  |-- notification and transactional-outbox state
  |-- playback leases/telemetry summaries
  |-- ingestion provenance and audit log
  |
Production adapters (not supplied by this repository)
  |-- identity/email verification
  |-- payment provider
  |-- Redis or equivalent atomic shared state
  |-- push/email delivery
  |-- schedule/results feeds
  |-- encoder, packager, origin, CDN, DRM and geo-IP
  `-- metrics, traces, alerting and log storage
```

The video data plane does not proxy media through Next.js. After the control plane resolves rights and entitlement, it should return a short-lived, audience-bound playback authorization. The player then connects to the media edge. See [media-pipeline.md](./media-pipeline.md).

## Repository boundaries

| Path                       | Responsibility                                                        | Dependency rule                                                             |
| -------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/app`                  | App Router pages, route handlers, layouts, loading/error states       | May call server/domain modules; must not embed vendor credentials           |
| `src/components`           | Product UI and client preference/session helpers                      | May consume view models; should not query PostgreSQL directly               |
| `src/domain`               | Framework-independent status, spoiler, content and Tallinn-time rules | Must remain deterministic and side-effect free                              |
| `src/player`               | Playback protocol selection, controls, recovery and client telemetry  | Receives authorized sources; must not decide contractual rights             |
| `src/server/db`            | Drizzle schema and build-phase-safe lazy database client              | Persistence only; business decisions stay in service/policy modules         |
| `src/server/auth`          | Session-token primitives and session policy                           | Routes must additionally check server-side session state/revocation         |
| `src/server/rights`        | Fail-closed rights-window resolution                                  | Pure decision point; geo and concurrency facts arrive from trusted adapters |
| `src/server/entitlements`  | Product/grant scope evaluation                                        | Payment webhooks create grants; this layer does not trust browser claims    |
| `src/server/notifications` | UTC scheduling, revisions and deduplication                           | In-app rows are durable; vendor delivery later uses an outbox/adapter       |
| `src/server/security`      | CSRF, playback tokens and rate-limit interfaces                       | Production rate limits require an atomic shared adapter                     |
| `src/server/observability` | Structured, redacted logging                                          | Never log raw session/playback tokens or provider payload secrets           |
| `scripts` / `drizzle`      | Seed/migration lifecycle                                              | Migrations are forward-only release artifacts                               |

## Data model

The schema deliberately separates people from teams and appearances:

```text
Athlete --< AthleteTeamMembership >-- Team
   |                                  |
   `---------< EventParticipant >-----`
                         |
Sport -- Competition -- Season -- Event -- Venue
                              |       |
                              |       +-- Result / TimelineEvent / Highlight
                              |       +-- Stream -- StreamRendition
                              |       +-- MediaAsset
                              `---------- RightsWindow

User --< Profile --< Follow
  |         |        (exactly one athlete/team/sport/competition target)
  |         +-- NotificationPreference / Notification
  |         +-- Entitlement / PlaybackSession
  `-- Session / Device / Subscription
```

This permits an Estonian athlete to remain followable while changing foreign clubs or competing individually. Event participant rows can reference an athlete, a team, or both; sport-specific details remain structured metadata instead of fixed football fields.

All instants are stored as timezone-aware UTC values. `Europe/Tallinn` is an output and notification-planning concern. Calendar-day queries calculate their UTC boundaries from a Tallinn local date, including daylight-saving transitions.

## Important request flows

### Public discovery and personalization

1. Validate locale (`et` or `en`) and bounded query/pagination inputs.
2. Resolve the signed cookie against the session, active user and profile-owner relationship in PostgreSQL.
3. Use only that owned profile for follows/feed/inbox data. If there is no valid session, use a reserved UUID that is never persisted, guaranteeing an empty personalization scope.
4. Read public catalogue and schedule rows; cache only responses that contain no profile, entitlement, or notification state.
5. Apply spoiler policy to the server view model before rendering or serializing it.
6. Format UTC instants in `Europe/Tallinn` at the presentation boundary.

In development, a client-side bootstrap may establish the seeded demo session after the anonymous first render and then refresh the server tree. The bootstrap endpoint is unavailable in production. It is not an identity-provider substitute.

Public cache keys must include locale and query filters. Personalized endpoints use `Cache-Control: private, no-store`; authorized playback responses use `no-store` and must never pass through a shared cache.

### Follow mutation

1. Resolve the authenticated server-side session and active profile.
2. Require exact Origin plus double-submit CSRF for cookie-authenticated unsafe requests.
3. Validate one and only one supported target type and identifier.
4. Insert/delete within that profile only; uniqueness constraints make retries safe.
5. Subsequent relational feed queries reflect the follow immediately; the next notification planning cycle sees it. A future high-volume projection can consume an outbox event.

### Playback authorization

1. Resolve country without accepting it from request JSON. The local implementation uses configured `DEFAULT_COUNTRY`; production must use a trusted edge geo signal and fail closed when territory is unknown.
2. Load the event, active rights windows, entitlement grants, stream state, profile maturity policy, and atomic active-playback count.
3. Resolve the most specific active rights policy. Equal-rank disagreement fails closed.
4. Check half-open time windows (`from <= now < until`), territory, content type, entitlement, and concurrency.
5. For an internal stream, serialize the per-profile count-and-insert and mint a 15–90 second token bound to profile, event, stream, rights window, country, protocol set, policy version and unique token ID.
6. Attach that claim only to a signed source locator when required; do not return a separate raw JWT field in JSON. The media edge independently verifies the claim and current revocation/policy state. A URL signature alone is not a subscription system.
7. Parse internal and external locators and reject every scheme except HTTP(S). For external-only rights, return the official destination; for no rights, retain the event page and explain availability. Production adds HTTPS-only provider host allow-lists.

The repository contains policy and token primitives. A production geo-IP source, atomic lease store, media-edge verifier, key rotation service and revocation propagation are external work.

### Schedule correction and notification

The implemented local path is database-backed rather than a mock:

1. A planning cycle queries active profiles' athlete, team, sport and competition follows against scheduled, delayed, live and paused events in a bounded UTC window.
2. It loads in-app preferences and applies a matching subject preference before the global preference, falling back to the follow/default setting.
3. It creates starting-soon, started and followed-athlete-competing rows. The stable key covers profile, event revision, notification kind and discriminator; PostgreSQL `ON CONFLICT DO NOTHING` makes a repeated cycle idempotent.
4. The worker claims due in-app rows with `FOR UPDATE SKIP LOCKED` and commits the sent state atomically, making the row visible in the inbox.

Pure rules also reconcile revised schedules by cancelling obsolete pending lifecycle intents and creating schedule/venue-change intents. Result/highlight kinds exist in the model and preference UI. No authoritative feed adapter currently invokes those change/result/highlight paths, and no push/email provider adapter exists.

The production ingestion target remains: authenticate each source; retain external ID/version, checksum, payload and observation time; normalize UTC/entities; reconcile by trust priority and revision; write canonical state, audit and outbox in one transaction; then invalidate caches and plan delivery. Operator corrections require before/after state, evidence and reason.

## Authorization model

The matrix below is the required launch policy, not an implemented staff console. Current user mutations are owner-scoped viewer actions. The read-only development admin demonstration is hard-404ed by the production proxy until staff SSO, MFA, server-side RBAC and audited mutation endpoints exist.

| Capability                                                | Viewer | Editor | Operator | Admin |
| --------------------------------------------------------- | :----: | :----: | :------: | :---: |
| Browse catalogue and legal destinations                   |  yes   |  yes   |   yes    |  yes  |
| Manage own profiles, follows and notification preferences |  yes   |  yes   |   yes    |  yes  |
| Read own subscription, devices and playback sessions      |  yes   |  yes   |   yes    |  yes  |
| Edit editorial collections and catalogue copy             |   no   |  yes   |    no    |  yes  |
| Correct schedules/results with audit reason               |   no   |  yes   |   yes    |  yes  |
| Control stream state and incident actions                 |   no   |   no   |   yes    |  yes  |
| Manage users, roles, products and global policy           |   no   |   no   |    no    |  yes  |

Every object read or mutation must be scoped server-side to the active user/profile. Hiding a control in the UI is not authorization. Privileged mutations require reauthentication or suitably short sessions, an audit reason, and an immutable audit record. The role vocabulary must be identical in database, session claims, and route guards before production.

## Scaling path

1. Run multiple stateless web replicas behind a managed load balancer; use pooled PostgreSQL connections.
2. Replace in-memory rate limiting and playback counts with Redis-compatible atomic scripts or a strongly consistent lease service.
3. Run notification/outbox and ingestion workers independently from web replicas.
4. Add read replicas for public schedule/catalogue queries; keep rights and entitlement authorization on the primary or a consistency-guaranteed store.
5. Cache immutable artwork and public schedule responses at the edge. Purge/update by surrogate key when an event revision changes.
6. Keep media bytes on a multi-CDN data plane. Metadata/control-plane degradation must not terminate already-authorized playback.
7. Split services only where load or ownership justifies the operational cost; preserve the policy test suites and versioned HTTP/event contracts.

## Reliability and consistency rules

- Rights, entitlement, parental-policy, session and concurrency checks fail closed.
- Event updates are revisioned; stale provider updates cannot silently overwrite a newer manual correction.
- Notification and outbox deduplication is enforced with database uniqueness, not process memory.
- Current authorization rows expire and are counted under a per-profile database lock. Production still needs the documented heartbeat/end path and shared expiring lease store so crashed clients release capacity predictably across replicas.
- Schedule pages may be stale for a short cache TTL; playback authorization may not be cached.
- Existing authorized playback should tolerate a brief control-plane outage, subject to the contractual revocation policy.
- Health endpoints separate liveness (process can serve) from readiness (critical dependencies available).

## Architecture decisions still required before launch

- Contracted identity provider and account recovery/MFA policy.
- Payment service provider and EU VAT/refund/Strong Customer Authentication flows.
- Media vendors, codecs, DRM systems, origin/CDN strategy and player-device matrix.
- Geo-IP vendor and contractual VPN/proxy policy.
- Schedule/results providers and source precedence agreements.
- Push/email vendors and message-retention rules.
- Consent-management platform, analytics processor agreements, and final GDPR retention schedule.
- Production SLOs and capacity numbers based on measured traffic and playback tests.
