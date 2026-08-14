# Security and privacy

Last reviewed: 2026-08-14

This is a security design and gap record, not a certification. The local demo contains policy primitives and a production-shaped schema; it has not undergone an independent penetration test, DPIA, legal review or production key-management review.

## Assets and trust boundaries

Protect, in priority order:

- contracted media and geographic/time/content restrictions;
- signing, ingest, identity, payment, DRM and provider credentials;
- accounts, profiles, parental PINs, device and session records;
- subscription/entitlement and playback-concurrency state;
- private follows, notification preferences, viewing telemetry and support diagnostics;
- editorial schedules/results and operator/audit integrity; and
- service availability around synchronized live-event traffic.

Untrusted inputs include every browser field/header/cookie, provider webhook, schedule/results feed, uploaded asset/caption, external viewing URL, geo hint not supplied by the trusted edge, media manifest, and administrator-entered text. TLS termination, CDN/WAF and vendor networks do not make payloads trusted.

## Current repository controls

The codebase contains:

- Zod validation for environment configuration, including production HTTPS and independent minimum-length secrets;
- signed session-token primitives with algorithm, issuer, audience, expiry and unique-ID verification, plus secure production cookie settings;
- server-rendered viewer resolution that revalidates the session hash/state and profile ownership in PostgreSQL; unauthenticated SSR uses a non-persisted empty personalization scope;
- double-submit CSRF and exact-Origin validation helpers for cookie-authenticated unsafe requests;
- development-only event/source mutation routes that hard-404 in production, use strict Zod input schemas, private/no-store responses, per-CSRF-token-hash process-local limits and optimistic concurrency;
- short-lived signed playback claims bound to profile, event, stream, rights window, country, content type, protocol set and policy version; signed access is carried only inside the authorized locator, not as a separate raw-JWT response field;
- deterministic, fail-closed rights and entitlement evaluators with exclusive expiry boundaries;
- bounded in-memory rate-limit and idempotency adapters explicitly intended only for local/test use;
- PostgreSQL uniqueness, foreign keys, checks, session/device/playback records, notification/outbox deduplication, ingestion provenance and audit-log tables;
- structured JSON logging with common password, token, cookie, authorization and secret paths redacted;
- transactional development audit rows for event/source changes with required reason, request ID and before/after snapshots; source locator query values are redacted and a supplied client IP is HMAC-pseudonymized;
- security headers including CSP, frame denial, MIME sniffing protection, referrer and permissions policy;
- parsed HTTP(S)-scheme validation before stored playback/external destinations are returned to the browser; and
- React's default text escaping and a schema that stores editorial text rather than executable markup.

A helper existing in the repository does not secure an endpoint by itself. Every route must invoke the relevant authentication, authorization, validation, CSRF, rate-limit and cache policy. The final route inventory and tests are the evidence for that wiring.

## Required production controls and known gaps

- Replace demo session bootstrap with a contracted identity flow: verified contact point, secure password hashing or OIDC, account recovery, credential-stuffing protection, MFA for privileged roles, and session/device revocation.
- Keep the production hard 404 for the development admin page and all event/source/rights/provider APIs until staff SSO, MFA, route-level/object-level RBAC, attributable tamper-evident audit and contracted provider controls are deployed and tested.
- Keep session state server-side. On every sensitive request, verify the session row is active, not expired/revoked, belongs to the account, and has the current rotation/version. Rotate after login, privilege change and recovery.
- Keep the role vocabulary aligned across database, token claims and route guards. Test viewer/editor/operator/admin allow and deny cases at the object level as privileged routes are added.
- Replace process-local rate limits, idempotency and concurrency counts with atomic shared storage. A multi-replica deployment must not admit one limit per pod.
- Move signing keys to a secret/KMS service with key IDs, overlapping verification during rotation, audited access and an emergency revocation procedure. Symmetric development tokens must not be accepted directly by a third-party CDN without a designed trust boundary.
- Independently validate playback claims at the media edge/license service. Store/claim a hash of the unique token ID where one-time or replay-sensitive behavior is required.
- Contract a trusted geo-IP signal and define fail-closed behavior for missing/invalid country. Strip any client-supplied copy of the trusted edge header at the perimeter.
- Tighten the implemented HTTP(S)-scheme check to HTTPS-only allow-listed hosts for external viewing destinations, playback providers and webhook callbacks. Do not fetch arbitrary user-supplied URLs server-side.
- Encrypt push tokens and unusually sensitive provider identifiers at application level where threat modelling requires it. Use encrypted managed storage and TLS for all database/cache/provider connections.
- Add dependency/container/SBOM/secret scanning and independent application/player/media-edge testing before launch.

## Web and API protections

### Authentication and cookies

The development control room is an explicit exception to the production authentication model: it has no login, staff session or role check. Its page and APIs exist only outside production; same-origin CSRF, validation, rate limiting, provider-operation idempotency and audit reduce accidental local misuse but do not authenticate an operator. The supplied FFmpeg provider is also a development service and binds to loopback by default. Do not expose either service to an untrusted network or treat a CSRF token as a credential.

- Production cookie: `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain` attribute.
- Use short privileged sessions and step-up authentication for roles, rights, refunds, stream controls and personal-data export/deletion.
- Never persist bearer/session tokens in `localStorage`, URLs, analytics fields or client-visible error reports. The current signed-media exception is a short-lived, narrowly scoped playback claim in an authorized source locator; strip it from history, logs and telemetry, and prefer a signed cookie where the delivery topology permits.
- Device/session management shows coarse device and last-active information; revocation invalidates the server session, not only the UI row.

### CSRF

Every cookie-authenticated `POST`, `PUT`, `PATCH` and `DELETE` requires:

1. exact parsed Origin membership in the configured allow-list; and
2. a high-entropy double-submit value that matches in cookie and custom header using constant-time comparison.

Bearer-authenticated backend API calls are outside browser ambient-cookie CSRF, but still require authentication, scope and replay protection. Never use `GET` for mutations.

### XSS and content security policy

- Render user/editor/provider text as text. If rich text becomes necessary, accept a constrained AST and sanitize it server-side with a maintained allow-list; never trust stored HTML.
- Keep CSP narrow. The current policy permits inline styles/scripts required by the current Next.js build; remove allowances when the framework deployment supports nonces/hashes. Add only contracted media, analytics and provider origins.
- Do not insert external result/commentary HTML with `dangerouslySetInnerHTML`.
- The current response path validates parsed HTTP(S) protocol. Production must additionally require HTTPS and an approved host; include `rel="noopener noreferrer"` on external tabs.

### Injection

- Use Drizzle parameterization for values. Dynamic sort columns, identifiers and JSON paths come from enums/mappings, never direct input.
- Validate IDs, date ranges, cursors, locale, country and bounded page sizes before queries.
- Do not pass feed fields into shell commands, log templates, media command lines or template evaluators.
- Spreadsheet exports prefix or reject cells beginning with formula-control characters.

### SSRF and media parsing

- Schedule and media providers are configuration, not request parameters. The implemented registry accepts only `local-ffmpeg`; its development adapter permits only loopback HTTP, supplies the bearer token server-side, rejects redirects, applies a timeout and caps response bytes. A production registry must require HTTPS, resolve approved hostnames, block private/link-local/metadata destinations, pin protocol/port rules and use controlled egress where appropriate.
- Fetch external assets asynchronously in a sandboxed media worker. Check actual bytes, dimensions/duration, decompression ratio and antivirus policy; randomize storage keys.
- Browser playback may navigate to an official external HTTPS link. The server must not probe that arbitrary link on behalf of the user.

### Broken access control

- Load the active profile through the authenticated user relationship on every private operation. Never authorize because a request contains a profile ID.
- Viewer can mutate only its own account/profile resources. Editors cannot grant entitlements or roles. Operators cannot change billing. Administrators remain constrained by audited server-side policy.
- Check authorization both on collection queries and individual objects to prevent IDOR. Return consistent not-found/forbidden behavior where existence is sensitive.
- Rights and entitlement decisions use server/database facts only. Client country, subscription, age, stream ID, event status or DVR flags are hints at most.
- Development admin routes are not a staff authorization implementation. Their top-level production 404 is the security boundary until each privileged route can resolve an authenticated staff actor and enforce the launch-role matrix server-side.

### Rate limits and abuse

The development stream routes currently allow 60 mutations/minute per SHA-256 CSRF-token hash, and the event route allows 30. This bounded process-memory implementation resets per process and multiplies across replicas, so it is not an account/IP authorization or production abuse boundary.

Use separate shared policies for login/recovery, search, follows/preferences, playback authorization/heartbeat, vouchers, exports and privileged writes. Keys should combine privacy-preserving client/network signals with account/profile where appropriate. Responses expose standards-compatible limit/retry information without revealing whether an account exists.

Protect major events from synchronized retries with bounded queues, jitter, circuit breakers and static public status messaging. Never degrade by bypassing rights or entitlement checks.

### Webhooks and provider callbacks

- Verify provider signature over raw bytes, timestamp tolerance, expected endpoint/audience and event ID before parsing side effects.
- Store a unique provider event ID and process idempotently in a transaction.
- Fetch authoritative payment state from the provider when a callback changes entitlement; never trust price/product/account claims from redirect query parameters.
- Reject old/replayed/out-of-order state transitions and log an audit-safe reason.

## Media security

- Rights are independent for live, DVR, replay and highlights and use `startsAt <= now < endsAt`.
- Production authorization derives country at a trusted edge. The local adapter uses configured `DEFAULT_COUNTRY`; it still verifies rights/entitlement and serializes per-profile concurrency before returning media access.
- Playback tokens expire in seconds, are scope-limited and carry no contact/payment information. CDN/license validation must check signature, algorithm, issuer, audience, expiry, protocol/policy binding and revocation rules.
- Origin permits only packager/CDN identities. Ingest publishing credentials are event-specific and rotated.
- DRM is required when the contract calls for it; signed URLs alone do not encrypt media.
- Logs and telemetry remove query signatures, authorization headers, cookies, DRM challenges/licenses and raw IPs.
- The local control room implements an audited access-only emergency update to `unavailable`, which clears technical grants and stops later local authorization under that policy. It can also unpublish the supplied local manifest. This is a development takedown path, not legal notice or production CDN revocation. Production must stop both new authorization and contracted media delivery by event/territory/content type without deploying code, and must preserve attributable, tamper-evident audit evidence.

## Privacy and GDPR foundation

RADA must complete a lawful-basis and purpose analysis with Estonian/EU counsel before production. Likely processing categories are described here for engineering—not as legal conclusions.

| Data                                                    | Purpose                        | Minimization/control                                                                  |
| ------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| Account contact and authentication state                | provide/security of account    | keep contact fields separate from product telemetry; never log credentials            |
| Profiles, follows, spoiler/data preferences             | requested personalization      | profile-scoped; exportable/deletable; no need for precise location                    |
| Subscription, payment-provider references, entitlements | contract/access/accounting     | do not store full card data; retain statutory records separately from recommendations |
| Device/session and coarse security events               | session control/fraud defense  | hash/pseudonymize network/device signals; short operational retention                 |
| Notification tokens/preferences/delivery                | requested communication        | opt-in by channel and subject; encrypted token; immediate unsubscribe/revocation      |
| Playback quality events                                 | operate and improve streams    | consent where required; pseudonymous event/session IDs; no media URLs/tokens/raw IP   |
| Editorial/operator audit                                | integrity, rights and security | restricted access, tamper-evident retention, reason recorded                          |
| Support diagnostic bundle                               | solve user-requested issue     | explicit user action, preview/redaction, short expiry, access audit                   |

### Consent

- Service-essential cookies/session/security processing is separated from optional analytics/marketing choices.
- No analytics SDK or network request initializes before the applicable consent.
- Store consent policy version, timestamp, locale and choice. Withdrawal is as easy as grant and stops future optional collection.
- Do not dark-pattern consent or make paid playback conditional on unrelated marketing permission.

### Data-subject requests

- **Access/export:** step-up authenticate, generate an asynchronous machine-readable archive, notify through a verified channel, and expire the download quickly. Include account, profiles, preferences, follows, sessions/devices, purchases/entitlements, notifications and applicable viewing history; explain excluded security/legal records.
- **Correction:** permit profile/preference correction and route source sports-data correction through editorial provenance, because an athlete result may be public record rather than the user's personal record.
- **Deletion:** show material effects, revoke sessions/tokens immediately, cancel future notifications and queue deletion/anonymization across primary data, providers, analytics and derived stores. Retain only fields with documented legal/security basis and isolate them from product use.
- **Restriction/objection:** disable optional personalization/analytics while preserving the minimum contractual service.

Requests need identity verification, deadline tracking, audit evidence and processor propagation. The schema's `deletion_requested` state is only a foundation; export/deletion orchestration is not implemented by this repository.

### Retention design

Final periods require legal approval and contracts. Implement each as configuration with an owner and deletion job rather than an undocumented hard-coded promise. Starting proposals for review:

- raw optional player analytics: 30 days, aggregated anonymous service metrics longer;
- security/session events: 90–180 days unless an active investigation requires a hold;
- expired push tokens and failed notification payloads: delete promptly, generally within 30 days;
- support bundles: 7 days by default;
- account personalization: active account lifetime, then deletion/anonymization workflow;
- billing/tax evidence and privileged rights audit: jurisdiction/contract-specific schedule approved by counsel.

Backups age out under the same documented schedule; deleted data is not restored into live product use after disaster recovery.

### Children and parental controls

A child profile is not a separate legal account. The account holder controls maturity limit and parental PIN. Store only a salted memory-hard PIN hash; rate-limit attempts and do not reveal whether a title was hidden because of age. Do not infer or collect a child's exact birth date when an age band suffices. Disable profiling/marketing by default and complete the child-data legal assessment before offering the feature.

## Security verification gate

- [ ] Route-level authentication, object authorization and CSRF tests cover every unsafe endpoint.
- [ ] Viewer/editor/operator/admin allow/deny matrix passes and the role vocabulary is consistent.
- [ ] Production admin page and APIs remain hard-404ed until SSO/MFA, RBAC and privileged audit paths pass their allow/deny matrix.
- [ ] Session rotation/revocation and playback-token expiry/replay tests pass across replicas.
- [ ] Rights expiry, overlap conflict, unknown territory, entitlement revoke and concurrency race fail closed.
- [ ] CSP and external URL allow-list pass; no secrets/tokens appear in HTML, URLs, logs or telemetry.
- [ ] Dependency, container, secret and infrastructure scans pass with documented exceptions/owners/dates.
- [ ] Identity/payment/webhook/media adapters receive threat-model and penetration review.
- [ ] GDPR records, DPIA decision, processor contracts, retention jobs and DSAR/deletion rehearsal are approved.
- [ ] Incident/key-rotation/takedown exercises succeed and evidence is retained.
