# HTTP API

Last reviewed: 2026-08-14

The current HTTP API is an internal interface for the RADA web application and local demo. It is not a supported public partner API. Server-rendered pages read the catalogue through typed server modules and do not expose a duplicate JSON endpoint merely for architecture's sake.

Only routes in **Implemented routes** exist. The final section lists production interfaces still required; those paths are illustrative backlog, not callable endpoints.

## Conventions

- Versioned application endpoints use `/api/v1`.
- Request and response bodies are JSON with `Content-Type: application/json`.
- Input objects are strict: unknown fields are rejected where a body schema exists.
- Entity identifiers are UUID strings. Timestamps, when present, are ISO 8601 UTC instants such as `2026-08-14T09:00:00.000Z`.
- User-facing date grouping/formatting is performed with the `Europe/Tallinn` IANA zone; APIs do not return ambiguous local timestamps.
- Errors use an intentionally small envelope:

```json
{
  "error": {
    "code": "invalid_request",
    "fields": {
      "targetId": ["Invalid UUID"]
    }
  }
}
```

`fields` is optional. Error codes are stable program identifiers; localized UI copy belongs in the client dictionaries. Production responses must not include stack traces, SQL, tokens, provider payloads or rights-contract details.

## Authentication and CSRF

Local startup includes one development-only session endpoint. It creates a signed eight-hour session token and persists the hash/session state in PostgreSQL. Subsequent requests validate signature, algorithm, issuer, audience, expiry, token hash, non-revoked/non-expired session row, active user, and ownership of the selected profile.

Server-rendered pages resolve that same database-backed session and use only its owned profile for personalized queries. With no valid cookie they query through a reserved, non-persisted profile ID, producing an empty follow/inbox scope instead of exposing the seeded user's data. After hydration, development may call the demo-session endpoint and refresh; production cannot.

Cookie-authenticated unsafe requests require all of:

- exact `Origin` equal to `APP_ORIGIN`;
- `rada-csrf` cookie containing the browser-generated random token;
- matching `X-CSRF-Token` header; and
- for an established session, a SHA-256 match to the token hash bound to that session row.

The development session cookie is `rada-session`; production session primitives use the `__Host-rada-session` name with `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` and no Domain attribute. The demo session endpoint itself deliberately returns 404 in production, so a real identity flow must replace it.

## Caching and rate-limit headers

Every session/profile response is private and non-cacheable:

```http
Cache-Control: private, no-store, max-age=0
Pragma: no-cache
Vary: Cookie
```

Successful and limited calls include:

```http
RateLimit-Limit: 60
RateLimit-Remaining: 59
RateLimit-Reset: 1786698000
```

A `429` also includes integer-seconds `Retry-After`. The current limiter is bounded process memory for local/test use; production replicas require an atomic shared adapter. Clients should honor `Retry-After` and add jitter rather than retry in lockstep.

Liveness/readiness use public `no-store` responses without dependency details beyond the documented check names. `/api/v1/openapi` is public and cacheable for five minutes with stale-while-revalidate; it contains no credentials or private state.

## Implemented routes

### `GET /api/health/live`

Process liveness. It deliberately does not fail because PostgreSQL is temporarily unavailable:

```json
{ "status": "ok", "service": "rada-web" }
```

### `GET /api/health/ready`

Validates environment configuration and runs a bounded database `select 1`. Success is `200`:

```json
{
  "status": "ready",
  "checks": { "database": "ok", "environment": "ok" }
}
```

Failure is `503` with `status: "not_ready"`; it does not expose a connection string, SQL error or stack trace.

### `GET /api/v1/openapi`

Returns the OpenAPI 3.1 route inventory used for lightweight discovery. The checked-in runtime document summarizes paths and status codes; this document remains the more detailed behavior contract. It is not generated from runtime Zod schemas yet, so CI contract tests are required before treating it as a partner SDK source.

### `POST /api/v1/session/demo`

Creates the fixed, seeded development session. This endpoint is unavailable when `NODE_ENV=production`.

Request:

```json
{}
```

Created response — `201`:

```json
{
  "authenticated": true,
  "profileId": "11000000-0000-4000-8000-000000000001",
  "expiresAt": "2026-08-14T18:00:00.000Z"
}
```

If the request already has that active demo session, the idempotent response is `200`:

```json
{
  "authenticated": true,
  "profileId": "11000000-0000-4000-8000-000000000001"
}
```

| Status | Code                    | Meaning                                                |
| -----: | ----------------------- | ------------------------------------------------------ |
|    400 | `invalid_request`       | body is not exactly an empty object                    |
|    403 | `csrf_failed`           | Origin or double-submit token failed                   |
|    404 | `not_found`             | production deliberately has no demo login              |
|    429 | `rate_limited`          | 12-attempt/minute local subject limit reached          |
|    503 | `demo_data_unavailable` | migrations/seed did not create the fixed demo identity |

The response sets an HttpOnly session cookie. It never returns the session token in JSON.

### `POST /api/v1/follows`

Ensures the active profile follows one athlete, team, sport or competition. Repeating the same POST succeeds without creating a duplicate because the database enforces a unique profile/target relation.

Request:

```json
{
  "targetType": "athlete",
  "targetId": "40000000-0000-4000-8000-000000000001"
}
```

Response — `200`:

```json
{
  "targetType": "athlete",
  "targetId": "40000000-0000-4000-8000-000000000001",
  "following": true
}
```

`targetType` is exactly one of `athlete`, `team`, `sport`, `competition`; `targetId` must be a UUID and must exist in that target table.

### `DELETE /api/v1/follows`

Ensures the active profile no longer follows the supplied target. The JSON body is identical to POST. Repeating DELETE is state-idempotent.

Response — `200`:

```json
{
  "targetType": "athlete",
  "targetId": "40000000-0000-4000-8000-000000000001",
  "following": false
}
```

Common follow errors:

| Status | Code                      | Meaning                                                           |
| -----: | ------------------------- | ----------------------------------------------------------------- |
|    400 | `invalid_request`         | strict body validation failed; optional field errors are included |
|    401 | `authentication_required` | no active database-backed session/profile                         |
|    403 | `csrf_failed`             | Origin/token/session binding failed                               |
|    404 | `target_not_found`        | POST target does not exist for its declared type                  |
|    429 | `rate_limited`            | 60 mutations/minute for the active profile exceeded               |

The endpoint never accepts a profile/user ID. Scope comes only from the validated session, preventing a caller from following on behalf of another profile. DELETE of a missing target relation still returns the requested `following: false` state; it does not reveal another profile's state.

### `POST /api/v1/notification-preferences`

Upserts in-app preferences for the active profile. Current subject scopes are global, athlete and team; push/email adapters are not present.

```json
{
  "targetType": "athlete",
  "targetId": "40000000-0000-4000-8000-000000000001",
  "enabled": true,
  "leadMinutes": 15,
  "categories": [
    "event_starting_soon",
    "schedule_changed",
    "followed_athlete_competing",
    "important_result",
    "highlight_available"
  ]
}
```

`targetType` is `global`, `athlete` or `team`. Global has no `targetId`; the other scopes require an existing UUID. `leadMinutes` defaults to 15 and is bounded from 0 to 1440. Categories are unique members of:

- `event_starting_soon`
- `event_started`
- `schedule_changed`
- `venue_changed`
- `followed_athlete_competing`
- `important_result`
- `highlight_available`

The `200` response echoes the normalized request plus the preference row IDs/kinds written. The transaction serializes changes per profile and updates only `in_app` channel rows. The settings page exposes the global control; athlete and team pages expose their scoped controls. Rate limit: 30/minute/profile.

The database planner currently consumes `event_starting_soon`, `event_started` and `followed_athlete_competing`. A matching athlete/team preference overrides the global preference; otherwise the global row, then the follow's notification flag/default lead, applies. The worker inserts by a unique deduplication key and atomically exposes due in-app rows. The other accepted categories are model/rule foundations: schedule/venue changes and result/highlight availability are not yet driven by an authoritative feed, and push/email delivery is not implemented.

### `POST /api/v1/notifications/read`

Marks every unread notification visible to the active profile, including account-level rows, as read. Body is exactly `{ "all": true }`.

```json
{ "all": true, "updated": 2 }
```

Rate limit: 20/minute/profile.

### `POST /api/v1/notifications/{notificationId}/read`

Idempotently marks one notification owned by the active user/profile as read. Body is exactly `{}`. Response contains its ID, `read: true` and the original/new UTC `readAt`. A missing or other-profile ID returns the same `notification_not_found` 404. Rate limit: 120/minute/profile.

### `POST /api/v1/events/{eventId}/playback-authorizations`

Resolves parental policy, content type, time/territory rights, entitlement and active concurrency before disclosing any media locator. Request:

```json
{ "contentType": "live" }
```

`contentType` is `live`, `replay` or `highlight` and defaults to live. Internal/demo authorization returns `201` (abridged example):

```json
{
  "allowed": true,
  "delivery": "public_demo",
  "playbackSessionId": "9c3a0e2c-cd10-491c-9b9f-d10a3bb67ab5",
  "expiresAt": "2026-08-14T09:01:30.000Z",
  "sources": [
    {
      "id": "91000000-0000-4000-8000-000000000001",
      "kind": "hls",
      "url": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      "label": "mux-public-test"
    }
  ],
  "dvrPermitted": true,
  "dvrWindowSeconds": 1800
}
```

Production signed streams use `delivery: "signed"`; the short-lived claim is attached to the authorized source locator only when the stream requires signed access. A raw JWT is never returned as a separate JSON field. The locator and authorization cannot outlive either 90 seconds or the rights-window end. Count-and-lease is serialized with a per-profile PostgreSQL advisory transaction lock. This is correct for the current database-backed service; production media-edge validation, heartbeat/lease expiry, trusted geo-IP and key rotation are still required.

An official external-only destination is a successful policy resolution but not inline authorization, returned as `200`:

```json
{
  "allowed": false,
  "reason": "external-only",
  "externalDestination": "https://rights-holder.example/event"
}
```

Both internal playback locators and external legal destinations are parsed server-side and must use HTTP or HTTPS. Invalid/malformed destinations fail as unavailable and are not disclosed. Production must further require HTTPS and an approved provider-host allow-list. Policy denials return `allowed: false` without a media locator (normally 403, or 409 for concurrency). Cancelled events are 409; unavailable streams are 503 with `Retry-After`; malformed/event-not-found/session/CSRF/rate errors use the standard error envelope. Rate limit: 30/minute/profile.

The current territory input is server configuration `DEFAULT_COUNTRY`, suitable only for the local adapter. Production must replace it with a trusted edge country signal and define fail-closed unknown-country behavior.

### `POST /api/v1/playback-telemetry`

Accepts a strict, privacy-minimal operational event for the newest active playback lease matching the current profile, event and optional stream. Example:

```json
{
  "type": "playback_ready",
  "at": "2026-08-14T09:00:01.450Z",
  "eventId": "70000000-0000-4000-8000-000000000001",
  "sourceId": "91000000-0000-4000-8000-000000000001",
  "sourceKind": "hls",
  "value": 1450
}
```

Allowed event families are source attempt/skip/fallback, playback ready/started/paused/recovering/failed, quality change, jump-to-live and bounded metrics. The schema excludes URLs, tokens, free-form errors, device fingerprints and user/profile IDs. It updates allow-listed playback-session health fields and returns `202 { "accepted": true }`; it is not a general analytics ingestion endpoint. Rate limit: 240/minute/profile session.

### `GET /api/v1/calendar.ics`

Returns a private RFC 5545 calendar for events matching the active profile's athlete, team, sport and competition follows. Events are UTC, carry localized metadata, include cancellation/sequence revisions, respect maturity limit, span 30 days back through 366 days ahead, and are capped at 1000. Response headers include:

```http
Content-Type: text/calendar; charset=utf-8
Content-Disposition: attachment; filename="rada-my-sports.ics"
Cache-Control: private, no-store, max-age=0
```

This is an authenticated snapshot download, not a long-lived secret subscription URL. Rate limit: 30/minute/profile session.

### Development-only operator routes

The following routes back the local <code>/{locale}/admin</code> control room. They perform real PostgreSQL mutations, but only when <code>NODE_ENV</code> is not <code>production</code>. They intentionally have no staff login or role check yet; every route returns <code>404 not_found</code> before CSRF parsing or database access in production. Run them only on a trusted local development host.

All unsafe calls require the same exact-Origin and double-submit CSRF check described above. The browser control room creates the CSRF cookie/header pair; a development session is not required. Responses are private and non-cacheable, include a request ID, and expose rate-limit headers. The process-local limits are 60 stream/provider mutations, 30 rights mutations and 30 event mutations per minute per CSRF-token hash.

The lightweight runtime OpenAPI document inventories these development routes so tooling can discover them, but they are not a production or partner surface. Their complete current contract and safety constraints are documented here.

#### POST /api/v1/admin/streams

Creates a demo playback-source record for an existing event. Creation alone does not provision a provider, encoder, packager, origin or CDN, and it does not create a rights window. A saved `local-ffmpeg` HLS source can subsequently use the dedicated operations endpoint below.

    {
      "eventId": "70000000-0000-4000-8000-000000000001",
      "reason": "Add the tested backup manifest",
      "protocol": "hls",
      "state": "ready",
      "priority": 20,
      "playbackLocator": "https://media.example.test/live/master.m3u8",
      "externalWatchUrl": null,
      "provider": "demo-origin",
      "providerStreamRef": "event-001-backup",
      "requiresSignedAccess": true,
      "dvrWindowSeconds": 1800,
      "captionsAvailable": true
    }

- Protocol is <code>webrtc</code>, <code>ll_hls</code>, <code>hls</code> or <code>external</code>.
- State is <code>provisioning</code>, <code>ready</code>, <code>live</code>, <code>degraded</code>, <code>ended</code> or <code>unavailable</code>; default <code>provisioning</code>.
- Priority is an integer from 0 through 32767; default 100. Authorization ordering considers state, then protocol, then ascending numeric priority, unless a rights window names a specific stream.
- Internal protocols require <code>playbackLocator</code> and prohibit <code>externalWatchUrl</code>. External protocol requires <code>externalWatchUrl</code> and prohibits <code>playbackLocator</code>.
- Locators must be absolute HTTP(S), no longer than 2048 characters, and cannot contain URL credentials. The local allowance is not a production host allow-list.
- Provider is 1–100 characters and <code>providerStreamRef</code> is 1–200; control characters are rejected. The provider/reference pair is unique and serialized with a PostgreSQL advisory lock.
- <code>requiresSignedAccess</code> defaults to true, <code>dvrWindowSeconds</code> is 0–2592000 and defaults to zero, and <code>captionsAvailable</code> defaults to false.
- Reason is required, trimmed, and 3–500 characters. Unknown fields are rejected.

Created response: <code>201 { "data": AdminStream, "requestId": "..." }</code>. The created row always has <code>isDemo: true</code>. <code>AdminStream</code> includes the bilingual event title, source fields, <code>lastHealthyAt</code> and the optimistic-concurrency value <code>updatedAt</code>.

#### PATCH /api/v1/admin/streams/{streamId}

Updates one or more source fields. Supply the exact <code>updatedAt</code> returned by the latest read:

    {
      "reason": "Primary signal passed the readiness check",
      "expectedUpdatedAt": "2026-08-14T12:00:00.000Z",
      "state": "live",
      "priority": 10
    }

At least one editable source field is required. The patch is merged with the stored row and the complete internal/external locator invariant is revalidated. A successful response is <code>200 { "data": AdminStream, "requestId": "..." }</code> with a new <code>updatedAt</code>. A stale timestamp returns <code>409 version_conflict</code> rather than silently overwriting another operator.

#### DELETE /api/v1/admin/streams/{streamId}

    {
      "reason": "Retire the obsolete demo fallback",
      "expectedUpdatedAt": "2026-08-14T12:00:00.000Z"
    }

Deletion is intentionally guarded. The row must be a demo stream, its current state must be <code>ended</code> or <code>unavailable</code>, its timestamp must still match, and it must have no unexpired authorized playback or recently heartbeating playback. The UI additionally requires the operator to type the exact provider stream reference. The database deletes dependent stream-specific rights windows, renditions and playback sessions through foreign-key cascades.

Success is:

    {
      "data": {
        "id": "91000000-0000-4000-8000-000000000001",
        "deleted": true,
        "cascaded": {
          "rightsWindows": 0,
          "renditions": 3,
          "playbackSessions": 0
        }
      },
      "requestId": "..."
    }

Every stream create/update/delete writes its audit row in the same transaction. The row contains the required reason, request ID, null development actor, action, target, before/after snapshot, HMAC-pseudonymized client IP when supplied and a bounded user-agent summary. Query values and fragments in stored locators are removed from audit snapshots.

Common stream errors:

| Status | Code                                      | Meaning                                                |
| -----: | ----------------------------------------- | ------------------------------------------------------ |
|    400 | <code>invalid_request</code>              | strict request validation failed                       |
|    400 | <code>invalid_stream_configuration</code> | merged protocol/locator fields violate the invariant   |
|    403 | <code>csrf_failed</code>                  | exact-Origin/double-submit validation failed           |
|    403 | <code>demo_stream_required</code>         | deletion targeted a non-demo stream                    |
|    404 | <code>event_not_found</code>              | create targeted a missing event                        |
|    404 | <code>stream_not_found</code>             | update/delete targeted a missing stream                |
|    404 | <code>not_found</code>                    | route is intentionally unavailable in production       |
|    409 | <code>version_conflict</code>             | <code>expectedUpdatedAt</code> is stale                |
|    409 | <code>provider_reference_conflict</code>  | provider/reference pair is already assigned            |
|    409 | <code>stream_must_be_inactive</code>      | delete targeted a source not ended/unavailable         |
|    409 | <code>active_playback_exists</code>       | delete targeted a source with a current playback lease |
|    429 | <code>rate_limited</code>                 | local stream-mutation limit exceeded                   |

#### POST /api/v1/admin/streams/{streamId}/operations

Executes one lifecycle command through the server-selected media-provider adapter. This implementation accepts only an HLS stream whose stored provider is <code>local-ffmpeg</code>; the request cannot supply a provider URL or credential. Header <code>Idempotency-Key</code> is required, 8–180 characters, and limited to letters, numbers, dot, underscore, colon and hyphen.

    {
      "action": "publish",
      "reason": "Synthetic manifest passed the local readiness check",
      "expectedUpdatedAt": "2026-08-14T12:00:00.000Z"
    }

<code>action</code> is <code>provision</code>, <code>start</code>, <code>publish</code>, <code>unpublish</code>, <code>stop</code> or <code>refresh</code>. The local transition order is provision, start, publish, unpublish, then stop; refresh is observation-only. A published resource must be unpublished before stop. Provisioned and encoding resources map the catalogue stream to <code>provisioning</code>; a healthy published resource maps to <code>live</code>, an unhealthy published resource to <code>degraded</code>, stopped to <code>ended</code>, and absent/failed to <code>unavailable</code>.

Before the provider call, PostgreSQL stores the desired resource state and a unique pending operation. On completion it stores observed state, safe result/error, provider request ID, operation timestamps and audit. Repeating the identical request with the same key returns the stored successful result; changing any request-bound value under that key returns <code>409 idempotency_conflict</code>. Only one operation may remain pending per stream. A pending operation younger than five minutes blocks another command. After five minutes its outcome is treated as unknown: only <code>refresh</code> with a new idempotency key may mark the abandoned operation failed and reconcile observed provider state. The server never blindly replays the original state-changing command.

Success is <code>200 { "data": { "operation": AdminMediaOperation, "resource": AdminMediaResource, "stream": AdminStream }, "requestId": "..." }</code>. A provider rejection/unreachable response is recorded as failed before the API returns its bounded error. Additional errors include <code>400 invalid_idempotency_key</code>, <code>409 operation_in_progress</code>, <code>409 stale_operation_requires_refresh</code>, <code>409 stale_operation_requires_new_idempotency_key</code>, <code>409 invalid_provider_transition</code>, <code>409 must_unpublish_first</code>, <code>409 version_conflict</code>, <code>422 provider_not_configured</code>, <code>422 provider_protocol_unsupported</code> and <code>502 provider_unreachable</code>. Production returns <code>404 not_found</code> before attempting the provider.

#### POST /api/v1/admin/rights-windows

Creates executable technical authorization policy; it does not create or validate a legal contract.

    {
      "reason": "Enter the approved local demo policy",
      "target": { "type": "event", "id": "70000000-0000-4000-8000-000000000001" },
      "contentKind": "live",
      "countryCode": "EE",
      "access": "free",
      "requiredProductId": null,
      "startsAt": "2026-08-14T12:00:00.000Z",
      "endsAt": "2026-08-14T16:00:00.000Z",
      "dvrAllowed": false,
      "recordingAllowed": false,
      "maxConcurrentStreams": 2,
      "externalWatchUrl": null,
      "rightsHolder": "Fictional demo rights holder",
      "contractReference": "DEMO-ONLY",
      "priority": 100
    }

Target type is <code>competition</code>, <code>event</code>, <code>stream</code> or <code>media_asset</code>; content is <code>live</code>, <code>replay</code> or <code>highlight</code>; access is <code>free</code>, <code>entitled</code>, <code>external_only</code> or <code>unavailable</code>. Country is an uppercased two-letter code or null for global policy. Entitled access requires an existing product; external-only requires an absolute credential-free HTTP(S) legal destination; other access modes prohibit those respective fields. Concurrency applies only to internal playback, DVR only to live, and unavailable cannot grant DVR or recording. End is exclusive and must be later than start. Higher numeric priority wins; overlapping effective scope/content/territory/time at the same priority is rejected rather than resolved ambiguously.

Created response: <code>201 { "data": AdminRightsWindow, "requestId": "..." }</code>. The target must resolve through current catalogue data. The mutation and <code>rights_window.created</code> audit row commit in one transaction.

#### PATCH /api/v1/admin/rights-windows/{rightsWindowId}

Updates at least one create field and requires <code>reason</code> plus the latest <code>expectedUpdatedAt</code>. The merged policy is revalidated, its target and product are resolved, equal-rank overlap is rejected, and a stale timestamp returns <code>409 version_conflict</code>.

An emergency access-only patch is intentionally concise:

    {
      "reason": "Apply the requested emergency local takedown",
      "expectedUpdatedAt": "2026-08-14T12:00:00.000Z",
      "access": "unavailable"
    }

The server atomically clears <code>requiredProductId</code>, <code>externalWatchUrl</code>, <code>maxConcurrentStreams</code>, <code>dvrAllowed</code> and <code>recordingAllowed</code>, preserves the policy row and writes <code>rights_window.updated</code> audit. This affects later authorization immediately; it does not withdraw a third-party CDN object or constitute legal notice to a rights holder. Success is <code>200 { "data": AdminRightsWindow, "requestId": "..." }</code>.

#### DELETE /api/v1/admin/rights-windows/{rightsWindowId}

    {
      "reason": "Remove the expired duplicate demo policy",
      "expectedUpdatedAt": "2026-08-14T12:00:00.000Z"
    }

Deletion is allowed only when the window is not currently active and its resolved target is demo data. Active policy returns <code>409 active_rights_window</code>; use the emergency unavailable update instead of erasing it. Non-demo targets return <code>403 demo_target_required</code>. Success is <code>200 { "data": { "id": "...", "deleted": true }, "requestId": "..." }</code>, with the before snapshot retained in <code>rights_window.deleted</code> audit.

Rights-route errors use the common <code>400 invalid_request</code>, <code>403 csrf_failed</code>, <code>404 rights_window_not_found</code>/<code>competition_not_found</code>/<code>event_not_found</code>/<code>stream_not_found</code>/<code>media_asset_not_found</code>/<code>product_not_found</code>/<code>not_found</code>, <code>409 media_asset_event_required</code>/<code>version_conflict</code>/<code>overlapping_policy_conflict</code> and <code>429 rate_limited</code> envelope as applicable. All three endpoints hard-404 in production.

#### PATCH /api/v1/admin/events/{eventId}

Updates one event and its audit entry atomically:

    {
      "reason": "Venue confirmed a fifteen-minute delay",
      "version": 3,
      "state": "delayed",
      "scheduledStartAt": "2026-08-14T15:15:00.000Z",
      "statusDetailEt": "Algus lükkub 15 minutit edasi",
      "statusDetailEn": "Start delayed by 15 minutes"
    }

The editable fields are <code>titleEt</code>, <code>titleEn</code>, <code>state</code>, <code>scheduledStartAt</code>, <code>actualStartAt</code>, <code>endAt</code>, <code>venueId</code>, <code>statusDetailEt</code> and <code>statusDetailEn</code>. At least one must be present. Titles are 1–240 trimmed characters; status details are null or 1–240 trimmed characters; venue is a UUID or null. Times are UTC ISO 8601 strings ending in <code>Z</code>; actual start and end may be null. The control-room form presents Tallinn wall-clock inputs and performs deterministic DST-aware conversion before calling this API.

State is <code>scheduled</code>, <code>delayed</code>, <code>live</code>, <code>paused</code>, <code>finished</code> or <code>cancelled</code>. Normal transitions use the shared event state machine. Entering live fills a missing actual start with server time; entering finished fills a missing end time. End must be later than actual start, or scheduled start when no actual start exists. <code>overrideInvalidTransition: true</code> permits a deliberate correction and changes the audit action to <code>event.manual_transition_override</code>; the UI shows an explicit confirmation.

Version is the latest positive integer from the control-room read. A successful transaction increments it and returns <code>200 { "data": AdminEvent, "requestId": "..." }</code>. A stale version returns <code>409 version_conflict</code> with <code>currentVersion</code>; the client refreshes instead of overwriting. A missing event or venue returns <code>404 event_not_found</code> or <code>404 venue_not_found</code>. Invalid state transitions and time ordering return <code>409 invalid_transition</code> and <code>409 invalid_schedule</code>. CSRF, production guard and rate-limit responses use <code>403 csrf_failed</code>, <code>404 not_found</code> and <code>429 rate_limited</code>.

The event audit row contains the reason, request ID, null development actor, action, target, full before/after event snapshots and bounded user-agent summary. It is written in the same transaction as the versioned update. This local database history is functional audit evidence, but it is not yet tamper-evident production audit storage or attributable to a staff identity.

## Runnable development example

Start PostgreSQL, migrate/seed and run the application first. This example creates a temporary cookie jar outside the repository and follows the fictional demo athlete Mari Mets:

```bash
csrf_token="$(openssl rand -hex 32)"

curl --fail-with-body --silent --show-error \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Origin: http://localhost:3000' \
  --header "X-CSRF-Token: ${csrf_token}" \
  --cookie "rada-csrf=${csrf_token}" \
  --cookie-jar /tmp/rada-demo-cookies.txt \
  --data '{}' \
  http://localhost:3000/api/v1/session/demo

curl --fail-with-body --silent --show-error \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Origin: http://localhost:3000' \
  --header "X-CSRF-Token: ${csrf_token}" \
  --cookie /tmp/rada-demo-cookies.txt \
  --cookie "rada-csrf=${csrf_token}" \
  --data '{"targetType":"athlete","targetId":"40000000-0000-4000-8000-000000000001"}' \
  http://localhost:3000/api/v1/follows
```

The cookie jar contains a development session credential. Delete it when finished and never paste its contents into logs/issues.

## Server-rendered page surface

These are HTML routes, not JSON API contracts:

| Route                       | Purpose                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `/`                         | redirect to Estonian locale                                                         |
| `/{locale}`                 | live, soon, Estonians today, followed feed, replay/highlights and schedule preview  |
| `/{locale}/schedule`        | complete Tallinn-time schedule                                                      |
| `/{locale}/discover`        | cross-entity discovery/search                                                       |
| `/{locale}/athletes/{slug}` | athlete biography, facts, club, competitions/events/results/media and follow state  |
| `/{locale}/teams/{slug}`    | team/club profile, athletes/events and follow state                                 |
| `/{locale}/events/{slug}`   | status, Tallinn time/countdown, player gate, rights, participants, timeline/related |
| `/{locale}/my-sports`       | followed entities, personalized schedule and calendar export                        |
| `/{locale}/notifications`   | in-app inbox, read state and demo notification controls                             |
| `/{locale}/settings`        | local theme/spoiler/data-saver plus global in-app notification/account foundations  |
| `/{locale}/admin`           | development-only event/source/rights/provider control room; production 404          |

`locale` is `et` or `en`; unknown locale/entity slugs return the localized not-found state. Additional page routes should be added here only after they exist.

## Production API contract backlog — not implemented

Production integration will require versioned, validated interfaces for at least:

- real login/callback/refresh/logout, account recovery/MFA and profile/device/session management;
- paginated public catalogue, search and schedule for native/TV clients;
- native/TV notification inbox/preferences/read state, device registration, and push/email provider callbacks;
- playback lease heartbeat/end/revocation, media-edge verification, trusted geo, key/version rotation and aggregate analytics pipeline;
- product/offer listing, checkout intent and signed/idempotent payment webhooks;
- data export/deletion request/status/download;
- authenticated schedule/results ingestion with provider event idempotency;
- production-authenticated editor/operator catalogue, correction, rights, stream-provider control and audit endpoints; and
- internal outbox/notification delivery and provider callback endpoints.

Before exposing a partner/public API, generate a complete OpenAPI document from the same runtime schemas, add cursor pagination, explicit compatibility/deprecation policy, per-client OAuth scopes, webhook signing/replay defense and contract tests. Do not expose internal Drizzle rows directly: public DTOs must keep rights contract references, raw source payloads, session/token hashes, provider IDs and audit/security data private.
