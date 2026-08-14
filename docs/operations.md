# Operations handbook

Last reviewed: 2026-08-14

The repository's admin/control views and sample records are development demonstrations. They do not control a real encoder, CDN, rights contract, billing provider, notification provider or production schedule feed. The production proxy deliberately returns 404 for the admin route; do not remove that guard before staff SSO/MFA, server-side RBAC and audited operations are ready.

## Ownership

| Role               | Owns                                                                        | Must not do alone                                                 |
| ------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Editorial          | catalogue copy, collections, athlete/team links, schedule/result correction | grant rights/entitlements or change production stream credentials |
| Event operator     | ingest readiness, stream state, protocol/CDN failover, event timeline       | alter commercial rights or customer billing                       |
| Rights manager     | rights window, territory, DVR/recording/replay/highlight policy, takedown   | operate encoder without media lead                                |
| On-call engineer   | application/data-plane diagnosis, rollback, traffic controls                | bypass rights to recover availability                             |
| Customer support   | account-scoped safe diagnostics and known workarounds                       | view raw tokens/payment data or grant admin access                |
| Incident commander | severity, coordination, decisions and review                                | silently combine command with every specialist role for a SEV-1   |

Production grants least privilege, requires MFA for privileged roles, and audits actor, action, target, request ID, reason, before/after state and timestamp. Emergency access is time bound and reviewed next business day.

## Event lifecycle

### Status meaning

| Status      | Operational meaning                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| `scheduled` | accepted future start; countdown and starting-soon notifications permitted                                          |
| `delayed`   | original/current start cannot be relied on; show source-updated guidance and suppress misleading countdown behavior |
| `live`      | event is underway; a stream may still be external, degraded or unavailable                                          |
| `paused`    | event temporarily stopped; preserve player/context and avoid declaring finished                                     |
| `finished`  | competition ended; live authorization closes according to the contract; replay/highlight states remain separate     |
| `cancelled` | event will not take place; cancel pending start notifications and retain explanation                                |

Only tested transitions are accepted. A provider status is input, not an unquestioned command; corrections and conflict resolution are revisioned.

### T-14 days: event acceptance

- Confirm canonical event/competition/season, participants and Estonian athlete mappings.
- Record source provenance, UTC start, Tallinn display check, venue/timezone and DST behavior.
- Attach signed rights data: holder, contract reference, territory, content type, window, access product, concurrency, DVR/recording and external destination.
- Assign contribution/production contacts and escalation tree.
- Create primary/backup stream identifiers and capacity forecast.
- Identify caption/audio/commentary commitments and age classification.

### T-72 to T-24 hours: technical readiness

- Validate both contribution paths, encoder profiles, timecode, A/V sync, captions and failover.
- Probe every rendition/protocol from representative Estonian fixed and mobile networks.
- Confirm origin/CDN capacity, geo, entitlement, signed-token/license and concurrency behavior.
- Reconcile provider schedule against venue/organizer source; approve outstanding conflicts.
- Review notification audience and templates in Estonian and English, including spoiler-free rendering.
- Confirm operator dashboard, alerts, recording target and official external fallback.
- Run a synthetic viewer journey using a non-privileged test account/profile.

### T-60 minutes to air

- Freeze nonessential application/media changes.
- Open incident/event channel; name event lead and next decision time.
- Verify primary/backup signals advance, UTC clock agrees, recording is writing, all health probes are green, and no unapproved slate is public.
- Confirm rights window opening at boundary tests (`from <= now < until`) and blocked-country behavior.
- Warm application/public schedule caches and media edge as permitted.
- Verify a starting-soon notification sample without sending to production recipients.

### Live

- Monitor start success, startup time, rebuffering, fatal errors, live latency, rendition distribution, CDN/origin errors, ingest continuity, A/V/captions, API availability and notification delay.
- Annotate intentional switches and material sports/schedule changes against UTC.
- Keep event context available even if media fails. Use a verified fallback protocol/CDN or official rights-holder destination.
- Communicate facts and the next update time. Never label estimated player live-edge distance as measured glass-to-glass latency.
- Do not extend, record, enable DVR, or publish a highlight merely to fix product pressure when the contract disallows it.

### Post-event

- Mark finish only from an authoritative source/operator confirmation.
- Verify recording completeness and contract before generating replay/highlights.
- Close live authorization and concurrency leases; confirm expiry at the exact rights boundary.
- Reconcile result/timeline, record manual corrections and publish only verified spoiler-safe notifications.
- Review QoE and incident evidence, delete temporary credentials, and schedule asset expiry.
- For priority events, complete a short operations report even when no incident occurred.

## Schedule and results ingestion

Each provider has a configured identity, type, trust priority and owner. For every received record, persist external ID/version, checksum, provider timestamp, receipt time and raw payload subject to retention/privacy policy.

Pipeline:

```text
fetch/webhook -> authenticate -> schema validate -> quarantine malformed input
 -> normalize IDs/UTC/status -> reconcile by source priority + revision
 -> transactional canonical update + audit/outbox
 -> cache invalidation -> notification planning -> delivery
```

Rules:

- Never interpret a timezone-less provider timestamp without a provider-specific, tested contract.
- Store the canonical instant in UTC; derive Tallinn grouping/display with the IANA `Europe/Tallinn` zone.
- Make provider event mapping explicit; fuzzy matching may suggest, never silently merge live events.
- Updates are idempotent by provider/external ID/version or checksum.
- A stale provider version cannot overwrite a newer accepted revision/manual correction.
- Conflicting authoritative sources enter an operator queue with evidence. Do not choose by arrival time.
- A manual correction requires reason, source evidence, before/after snapshot and actor. Define whether the override is pinned or can be superseded by a later provider revision.
- Quarantine raw payloads and avoid logging attendee/contact data not needed by the sports catalogue.

Monitor source freshness, lag from provider timestamp to accepted revision, invalid/quarantined ratio, unmatched entities, conflict queue age and manual-correction rate.

## Notification operations

The repository implements a PostgreSQL in-app path for three notification kinds: event starting soon, event started and followed athlete competing. Each cycle matches events to athlete/team/sport/competition follows, loads profile preferences, applies a matching subject preference before the global preference, and falls back to the follow/default setting. Global controls are available in Settings; athlete/team pages provide subject controls.

Planned rows use UTC and a stable key derived from profile, event, event revision, notification type and discriminator. A database uniqueness constraint plus `ON CONFLICT DO NOTHING` prevents repeated-cycle inserts. The worker atomically marks due `in_app` rows sent with `FOR UPDATE SKIP LOCKED`; an isolated 2026-08-14 exercise inserted 5 rows and delivered the 2 that were due, then inserted 0 and delivered 0 on an identical retry. That proves the exercised idempotent path, not notification-delay performance under load.

Pure reconciliation rules exist for schedule/venue revisions, and result/highlight kinds exist in the schema/preferences. They are not connected to an authoritative feed trigger. Push/email provider delivery, retry/dead-letter handling and delivery-time preference rechecks remain production work.

Before production, the delivery system must additionally:

- claim pending rows atomically (`FOR UPDATE SKIP LOCKED` or queue equivalent);
- mark a lease/attempt before calling the provider;
- supply stable provider idempotency ID where supported;
- classify permanent vs retryable failures and use bounded exponential backoff with jitter;
- cancel stale starting-soon/start intents when schedule revision changes;
- recheck profile/channel/subject preference and entitlement/privacy rules at delivery time;
- render locale and spoiler policy at delivery time so a newly enabled spoiler mode cannot leak a result from an old payload;
- store provider response identifiers, not full message content or device tokens in general logs; and
- dead-letter after the configured attempt ceiling with an alert and safe replay tool.

Quiet hours are interpreted in the profile timezone for ordinary messages. Time-critical start/change messages follow an explicitly documented product choice and preference. DST tests cover spring gaps and autumn duplicate wall-clock times.

Targets pending production measurement: p95 <60 seconds from accepted change/start to in-app availability and <120 seconds to provider acceptance for push/email. Report upstream feed delay separately.

## Control-room dashboard

For each event, show:

- canonical status/revision/start/venue and source freshness/conflicts;
- participant/Estonian mapping and public page link;
- rights window by content type/territory, entitlement product, DVR/recording, concurrency and exact expiry;
- primary/backup ingest, transcoder, packager, origin/CDN, manifest progression and recording health;
- protocol/rendition start success, startup, rebuffer, fatal errors, estimated live edge and actual measured glass-to-glass samples;
- notification counts by state/type/channel/revision and dead letters;
- active incidents, feature flags, last operator action and complete audit trail; and
- one-click-safe runbook links, not one-click unaudited destructive actions.

Use stale-data indicators on every panel. A green dashboard with a five-minute-old timestamp is not healthy.

## Observability

### Application SLIs

| SLI                                 | Initial target                                     | Alert example                                  |
| ----------------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| Public/event API availability       | 99.95% monthly                                     | fast burn over 5m + slow burn over 1h          |
| Playback authorization availability | 99.99% during priority windows                     | any sustained 5xx or dependency denial anomaly |
| Public API latency                  | p95 <300 ms for cached reads; p95 <750 ms uncached | threshold split by route/cache state           |
| Accepted schedule propagation       | p95 <60 s                                          | source-to-public revision lag                  |
| Notification acceptance delay       | p95 <60 s in-app; <120 s external provider         | queue oldest age and percentile                |

### Playback SLIs

Track authorized-start success, time to first frame, rebuffer ratio, fatal error rate, recovery time and measured glass-to-glass latency, segmented by event, protocol, browser/OS class, network class, CDN and rendition. Minimum sample size and consent coverage accompany every percentile.

### Logging and tracing

- Generate or accept a safe request ID and propagate it to database/outbox/provider calls.
- Use structured stable fields and controlled error codes. Redact cookies, authorization, session/playback/DRM tokens, passwords, secrets, media query signatures and raw push tokens.
- Hash IP only where a defined security purpose requires correlation, rotate the salt and apply short retention.
- Sample successful traces; retain errors more heavily without capturing bodies that may contain personal/secret data.

## Incident management

### Severity

- **SEV-1:** widespread priority live-event outage; unauthorized media exposure; signing/DRM/ingest credential compromise; incorrect billing/entitlement affecting many users.
- **SEV-2:** major degradation with fallback, large schedule/notification fault, one important platform/protocol unavailable, or meaningful privacy risk contained before exposure.
- **SEV-3:** localized defect with workaround, individual data correction or noncritical operator failure.

### Standard sequence

1. Declare incident, severity, commander, technical leads, communications lead and next update time.
2. Bound impact by event, territory, content, profile/device and start time using independent evidence.
3. Stop harm first: revoke unauthorized access/credentials, pause a bad notification batch, quarantine corrupt feed, or steer to a verified fallback.
4. Preserve evidence and audit all emergency changes. Do not expose credentials or personal data in incident chat.
5. Communicate affected function, scope, safe workaround and next update; avoid unsupported root-cause claims.
6. Verify recovery from the viewer path and independent probes, not only a vendor dashboard.
7. Run a blameless review within two business days for SEV-1/2, with owner/due date for every action.

The media-specific first response and runbook list are in [media-pipeline.md](./media-pipeline.md#11-incident-response).

## Customer-support diagnostics

Support sees only the account/profile currently being assisted and only fields needed for the case:

- safe event ID/title/time/status and public rights explanation;
- coarse app/browser/device/network class;
- consented playback error code, protocol, startup/rebuffer summary and timestamp;
- session/device label and revoke action, without token or fingerprint;
- subscription/product state and provider reference suffix, never card/bank credentials; and
- notification preference/delivery state without raw push token.

A user-generated diagnostic bundle requires an explicit action, previews included data, replaces IDs with case-scoped pseudonyms, strips URLs/query strings and expires quickly. Support access and exports are audited. Screen sharing never asks the user to reveal passwords, payment credentials, parental PINs or playback/session tokens.

## Feature flags and staged rollout

Flags are server evaluated for security/rights behavior and may target environment, event, stable pseudonymous cohort and supported device—not sensitive traits. Each flag has owner, purpose, created/expiry date, default, dependency and rollback behavior.

- A client flag may alter presentation but cannot grant entitlement, territory, DVR or role.
- Default unknown/failed evaluation to the safe established behavior.
- Audit privileged event-specific overrides.
- Roll out internal -> small cohort -> larger cohorts with explicit SLI guardrails.
- Remove expired flags and both code branches; a permanent flag system is operational debt.

## Routine drills

| Frequency                         | Drill                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Before every priority event       | end-to-end venue, rights, auth, geo, concurrency, playback, caption and fallback rehearsal                  |
| Monthly                           | notification duplicate/out-of-order replay; session/device revocation; rights-boundary canary               |
| Quarterly                         | PostgreSQL point-in-time restore; signing-key rotation; encoder/CDN failure; privacy export/deletion sample |
| Twice yearly                      | regional/control-plane recovery; mass schedule correction; SEV-1 communications exercise                    |
| Annually or after material change | threat model, DPIA/retention review, penetration/accessibility audit and vendor failover review             |

Drills record date, environment, scope, evidence, measured result, deviations, owner and follow-up due date. A checklist tick without observable evidence is not a completed drill.
