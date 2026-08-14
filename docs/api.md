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
| `/{locale}/admin`           | development-only read-only control-room demo; production proxy returns hard 404     |

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
- editor/operator catalogue, correction, rights, stream-control and audit endpoints; and
- internal outbox/notification delivery and provider callback endpoints.

Before exposing a partner/public API, generate a complete OpenAPI document from the same runtime schemas, add cursor pagination, explicit compatibility/deprecation policy, per-client OAuth scopes, webhook signing/replay defense and contract tests. Do not expose internal Drizzle rows directly: public DTOs must keep rights contract references, raw source payloads, session/token hashes, provider IDs and audit/security data private.
