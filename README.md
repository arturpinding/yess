# RADA

RADA is a bilingual, mobile-first sports discovery and viewing application for Estonia. It gives athlete-level following first-class status, brings major and smaller sports into one Tallinn-time schedule, preserves event context when a stream fails, and says explicitly whether an event is playable here, available from an official rights holder, or unavailable.

This repository is a runnable **local product demo and production foundation**, not an operating broadcaster. Its people, clubs, competitions, events, results and contractual records are clearly marked fictional demo data. The only inline video is a public test stream. RADA owns no sports rights, does not rebroadcast third-party events, and requires rights contracts plus real media infrastructure before serving production video.

## What is implemented

The repository currently contains:

- a responsive Next.js application shell with complete Estonian and English product copy, dark/light modes, visible focus states, reduced-motion handling, offline/loading/error/empty patterns and a persistent spoiler-free preference;
- a PostgreSQL/Drizzle model and forward migrations for accounts/profiles, sports catalogue, athlete-team history, events and participants, media, rights, products/entitlements, follows, notifications, results/timeline/highlights, editorial collections, playback sessions, ingestion provenance, audit logs and a transactional outbox;
- repeatable fictional seed data across biathlon, basketball, athletics, rowing, volleyball and football, including Estonian athletes at foreign demo clubs, eight self-hosted synthetic athlete portraits, every event status and explicit demo rights states;
- session-owned server-rendered personalization with a guaranteed-empty anonymous scope, plus framework-independent rules for event transitions, Tallinn day boundaries/DST, spoiler redaction, rights resolution, entitlement expiry, session/playback tokens, CSRF and rate limiting;
- a PostgreSQL-backed in-app planner and worker for starting-soon, started and followed-athlete notices, with a global Settings control, athlete/team controls, scoped-over-global preference precedence and database-enforced idempotency;
- a player abstraction that can select WHEP/WebRTC, LL-HLS, HLS or an official external destination, with ABR/manual quality, data saver, recovery/fallback, live edge, rights-controlled DVR, captions/audio controls, PiP, fullscreen, keyboard controls and privacy-conscious telemetry hooks; and
- structured/redacted logs, liveness/readiness conventions, container build, CI, coverage thresholds, Playwright mobile/desktop projects and production design/runbooks.

The user-facing page/API inventory is documented in [docs/api.md](docs/api.md). Controls labelled as demo do not call real broadcasters, payments or notification providers.

## What is not implemented or supplied

Production operation still requires:

- signed media-rights contracts and authoritative event/schedule/result feeds;
- venue contribution, redundant encoders, transcoders, CMAF packagers, WHEP/SFU service, protected origin, CDN/multi-CDN capacity, DRM, caption/commentary production and 24/7 media operations;
- a production identity provider or completed password/recovery/MFA flow;
- payment, voucher, VAT/refund and webhook integrations;
- geo-IP enforcement and an atomic shared concurrency/rate-limit/idempotency store;
- authoritative feed triggers for schedule-change/result/highlight notices, push and email providers, service workers/native apps, and production notification delivery adapters;
- consent-management/analytics vendors, finalized privacy notices/retention policy, DPIA and data-export/deletion orchestration;
- production editorial/feed adapters, immutable audit storage, feature-flag service and support tooling; and
- production observability, load/chaos/device testing, independent accessibility/security review and measured SLO evidence.

The schema and policy modules make these integrations possible; they are not evidence that the integrations exist.

## Estonia landscape and product position

Snapshot checked **2026-08-14**. It is deliberately narrow, based on public first-party/primary reporting, and is not a legal rights inventory:

- ERR holds Estonian media rights for the 2026–2032 Olympic Games; its 2026 coverage used ETV, ETV2, ETV+ plus the ERR Sport portal and Jupiter live/catch-up experience. [ERR rights announcement](https://news.err.ee/1608852005/ebu-lands-2026-2032-olympics-media-rights-err-to-broadcast-in-estonia), [ERR 2026 viewing guidance](https://sport.err.ee/1609934861/eestikeelse-kommentaariga-saab-olumpiat-vaadata-ka-etv-kanalilt).
- Go3 operates paid sports channels carrying both Baltic/local and international sport. Its public 2023 channel announcement described thousands of annual live hours across many major competitions; exact current rights must always be checked event by event. [TV3 Group announcement](https://www.tv3.ee/3-portaal/tele-ja-kino/go3/tv3-grupp-koondab-tasulised-telekanalidgo3-kaubamargi-alla/).
- Even one major tournament may span destinations: TV3 Group and ERR announced shared Estonian distribution for the 2026 FIFA World Cup, while Go3 carried all 104 matches. [TV3/Go3 announcement, 2026-05-14](https://www.tv3.ee/tv3telekanal/tv3-uudised/tv3-uudised-jalgpalli-mm-jouab-tv3-vahendusel-televaatajateni/), [ERR announcement](https://sport.err.ee/1609980570/jalgpalli-mm-finaalturniiri-ulekandeid-naitavad-tv3-go3-ja-err).

These facts support one restrained conclusion: discovery and lawful viewing destinations are event- and rights-dependent. They do **not** establish that another service has poor latency, accessibility or discovery. RADA's position is therefore measurable rather than comparative marketing: normalize events around Estonian participation, make the lawful destination unambiguous, and earn any playback-quality claim with instrumentation.

### Product requirements derived from that position

| Outcome                           | Acceptance measure                                                                                                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Find Estonians competing          | Today's Estonian-participation rail is visible on home; an indexed athlete's next event is reachable within two interactions; no sport-specific hard coding                                     |
| Trust the schedule                | All stored instants are UTC; every user-facing schedule is Tallinn-local; accepted provider changes reach public metadata p95 <60 s; DST unit/E2E cases pass                                    |
| Follow at athlete level           | Athlete, team, sport and competition follows persist per profile and change home, My Sports, recommendations, calendar and notification preferences                                             |
| Know where viewing is legal       | 100% of event pages show one of internal, official external or unavailable plus territory/rights-window explanation; unknown/conflicting rights fail closed                                     |
| Avoid spoilers                    | Scores, result text, result thumbnails/timeline markers and sensitive notification copy have zero leaks in automated spoiler-mode fixtures                                                      |
| Recover playback                  | Player retains event context, tries only authorized ordered fallbacks, and reports a usable official destination/error; fault-injection recovery target p95 <8 s when a healthy fallback exists |
| Work on mobile and assistive tech | Critical journeys pass the defined mobile/desktop Playwright matrix, keyboard-only review, 200% zoom and automated WCAG checks with no critical/serious violations                              |

## Architecture

RADA is a strongly typed modular monolith:

- **Next.js 16 / React 19 / TypeScript** provide server rendering, route handlers and one typed web codebase.
- **PostgreSQL 17 / Drizzle ORM** provide relational integrity, explicit migrations, UTC timestamp storage, uniqueness-based idempotency and an auditable data model.
- **Native media APIs + `hls.js` + an injectable WHEP connector** keep protocol/fallback behavior isolated from event UI and contractual rights decisions.
- **Vitest / Testing Library / Playwright / axe-core** cover domain/policy behavior and browser flows.
- **Pino** supplies JSON logs with token/secret-bearing paths redacted.

A modular monolith keeps rights, entitlements, schedules and profiles inside one transactional boundary at this stage. Ingestion and notification workers can be deployed separately, and video always travels directly from a media edge—not through the Next.js process. See [architecture.md](docs/architecture.md) and [media-pipeline.md](docs/media-pipeline.md).

## Quick start

Prerequisites:

- Node.js 22 or newer
- npm 10 or newer
- Docker Engine with Compose (for PostgreSQL)

From the repository root:

```bash
cp .env.example .env
```

Replace `SESSION_SECRET` and `MEDIA_SIGNING_SECRET` in `.env` with two different random values of at least 32 characters. The checked-in values are local placeholders and must never be deployed.

```bash
docker compose up -d --wait postgres
npm ci
npm run db:setup
npm run dev
```

Open <http://localhost:3000>. The root redirects to Estonian; use the visible `EN`/`ET` switcher or open <http://localhost:3000/en>.

A fresh browser's first server render is anonymous and receives an intentionally empty personalization scope. In development only, the hydrated client calls the CSRF-protected demo-session endpoint, receives an HttpOnly cookie and refreshes into the seeded profile owned by that session. Later server renders resolve that cookie and profile in PostgreSQL. If bootstrap is unavailable, public browsing remains anonymous; there are no real credentials. Production hard-disables the demo-session endpoint.

Re-running `npm run db:seed` is idempotent for fixed seed identities. Relative event times are set on first insert, so recreate the local volume if a much older demo schedule is no longer useful.

### Stop or reset local PostgreSQL

```bash
docker compose stop postgres
```

To intentionally delete the local demo database and rebuild it:

```bash
docker compose down --volumes
docker compose up -d --wait postgres
npm run db:setup
```

`docker compose down --volumes` is destructive for this repository's local database volume.

## Commands

| Command                        | Purpose                                                              |
| ------------------------------ | -------------------------------------------------------------------- |
| `npm run dev`                  | development server                                                   |
| `npm run build`                | optimized standalone production build                                |
| `npm start`                    | run the built server                                                 |
| `npm run db:migrate`           | apply checked-in Drizzle migrations                                  |
| `npm run db:seed`              | upsert fictional/local demo records                                  |
| `npm run db:setup`             | migrate then seed                                                    |
| `npm run worker:notifications` | plan and deliver in-app rows in a separate local worker              |
| `npm run format`               | write Prettier formatting                                            |
| `npm run format:check`         | verify formatting without changes                                    |
| `npm run lint`                 | ESLint with zero warnings allowed                                    |
| `npm run typecheck`            | TypeScript without emitting files                                    |
| `npm test`                     | Vitest unit/integration suite                                        |
| `npm run test:coverage`        | tests plus enforced coverage thresholds                              |
| `npm run test:e2e`             | Playwright mobile + desktop Chromium projects                        |
| `npm run verify`               | formatting, lint, types, unit tests and build (does not include E2E) |

Install the Playwright browser once before a first local E2E run:

```bash
npx playwright install chromium
npm run test:e2e
```

E2E expects PostgreSQL to be running and demo data to be migrated/seeded.

## Demo media and data

- All named people, clubs, competitions, venues, events, results, notifications, products and rights contracts inserted by `scripts/seed.ts` are fictional and carry demo markers.
- Eight synthetic athlete portraits are served from `public/athletes/demo/*.svg`; the UI renders those local assets and falls back to initials only if an image fails. It makes no external portrait request.
- Inline playback points to Mux's public `test-streams.mux.dev` HLS test asset. It is not an Estonian sports broadcast and is not a latency reference.
- The external viewing record uses `example.com` as an inert placeholder, not a broadcaster endorsement or valid destination.
- The demo entitlement, rights holder and contract reference exist only to exercise policy paths. They have no commercial/legal effect.

Do not replace a seed URL with a sports broadcast unless the organization has contractual distribution permission. A production importer must preserve rights holder, territory, content type, time window, DVR/recording permission and official destination provenance.

## Verification record

Recorded on **2026-08-14** against the final documented tree. A passing build or browser flow is not playback-latency evidence.

| Check                                | Command/environment                                   | Observed result                                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Locked dependency install            | clean checkout, `npm ci`                              | Pass                                                                                                                                                   |
| Production dependency audit          | `npm audit --omit=dev`                                | 0 known vulnerabilities                                                                                                                                |
| Full dependency audit                | `npm audit`                                           | 4 moderate development-only advisories in Drizzle Kit's nested `esbuild`; no safe stable dependency update was available at review time                |
| Formatting                           | `npm run format:check`                                | Pass                                                                                                                                                   |
| Lint                                 | `npm run lint`                                        | Pass, zero warnings                                                                                                                                    |
| Static types                         | `npm run typecheck`                                   | Pass                                                                                                                                                   |
| Unit/integration + coverage          | `npm run test:coverage`                               | 24 files, 73 tests passed; statements 76.15%, branches 65.96%, functions 80.92%, lines 78.72%                                                          |
| Migration + repeat seed              | local PostgreSQL 17                                   | Pass; 33 application tables, no migration/schema drift detected, second seed completed                                                                 |
| In-app planning/delivery idempotency | isolated PostgreSQL planner/worker cycles             | First cycle inserted 5 and delivered 2 due rows; identical retry inserted 0 and delivered 0. This is a functional check, not delivery-latency evidence |
| Native production build              | timed `npm run build`                                 | Pass in one local run: 27.58 s wall time, 738,828 KB peak RSS; `.next/standalone` 71 MiB and `.next/static` 1.6 MiB                                    |
| Container image                      | timed Docker build and image/filesystem inspection    | Warning-free pass in 83.04 s; approximately 82.99 MB, runtime UID:GID `1001:1001`, no `.env` or scratch/test artifacts found                           |
| Runtime health and production guard  | built runtime: live, ready, admin and SSR HTML probes | Pass; live/ready healthy, admin returned 404, and English SSR emitted `lang="en"`, dark theme and visible-spoiler attributes before hydration          |
| Desktop/mobile browser flow          | Playwright Desktop Chrome + Pixel 7                   | 12 passed, 2 intentionally skipped in 100.59 s; axe dark/light, spoiler, player and critical journeys included                                         |
| Manual responsive review             | stable desktop home, mobile athlete and event shots   | Visually inspected after the SSR theme-flash fix; this is not a WCAG conformance audit or a broad device-matrix result                                 |

### Performance and latency: targets versus measurements

| Metric                      | Design target                                                      | Measured in this repository                                    |
| --------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| WebRTC glass-to-glass       | p75 under 2 s where infrastructure permits                         | Not measured; no WebRTC media service/venue ingest             |
| LL-HLS glass-to-glass       | p75 approximately 2–5 s                                            | Not measured; no production LL-HLS pipeline                    |
| Standard HLS glass-to-glass | p75 approximately 6–15 s                                           | Not measured; public test asset has no controlled ingest clock |
| Authorized playback startup | p75 <2.5 s and p95 <5 s on defined Estonia network profiles        | Not measured; requires RUM plus device/network test matrix     |
| Rebuffer ratio              | p75 <0.5%, p95 <2%                                                 | Not measured                                                   |
| Video start success         | >=99.5% of authorized attempts                                     | Not measured                                                   |
| Player recovery             | p95 <8 s when a healthy authorized fallback exists                 | Not measured end to end                                        |
| Public/API availability     | 99.95% initial objective                                           | Not measured; no production observation window                 |
| Notification delay          | p95 <60 s in-app, <120 s to push/email provider                    | Not measured; external providers absent                        |
| Core Web Vitals             | p75 LCP <=2.5 s, INP <=200 ms, CLS <=0.1 on defined mobile profile | Not measured; needs deployed lab/RUM evidence                  |
| Initial non-player JS       | <=180 KiB gzip per primary route; player code only on event view   | Not measured; add a CI bundle budget before launch             |

The player health panel's distance from the live edge is an estimate from the media timeline. It must never be reported as glass-to-glass latency. The production test method is documented in [media-pipeline.md](docs/media-pipeline.md#10-test-programme).

The build time, memory, artifact sizes and notification retry exercise in the verification table are measured engineering results from the stated local runs. They do not measure page speed, player startup, live latency, rebuffering, scale, or the initial-JavaScript budget; total `.next/static` size is not a per-route gzip measurement.

## Security, privacy and accessibility

- Cookie-authenticated mutations use exact-Origin plus double-submit CSRF; routes must also enforce server-side session and object ownership.
- Rights/entitlement evaluation fails closed, uses exclusive expiry boundaries and issues short-lived media claims. A signed-access claim is embedded only in the authorized source locator; the response has no separate raw playback-JWT field. Production must add trusted geo, atomic concurrency leases, edge verification, key rotation/revocation and DRM where contracts require it.
- Stored playback and legal-handoff destinations are parsed and restricted to HTTP(S) before reaching the browser. Production still needs HTTPS-only provider host allow-lists and controlled outbound-fetch policy.
- Personalized, entitlement and playback-authorization responses must be `private, no-store`; they may never leak through shared cache keys.
- Structured logging redacts common secret/token/cookie paths. Raw media URLs, DRM exchanges, contact data and exact location do not belong in playback telemetry.
- Optional analytics is consent-gated. Export/deletion/retention tables are foundations, not a completed GDPR process; see [security-privacy.md](docs/security-privacy.md).
- UI work targets WCAG 2.2 AA with semantic landmarks, skip link, labels, visible focus, keyboard player controls, reduced motion, 200% zoom and spoiler redaction. Automated axe checks supplement—not replace—manual screen-reader, zoom, contrast and keyboard review.

Security headers are set in `next.config.ts`. Keep its media/connect allow-list narrow; adding a vendor requires contract, privacy and threat review, not only a CSP edit.

The development admin demonstration is hard-404ed by the production proxy. It must remain unavailable until a real staff identity provider, MFA, server-enforced RBAC and audited mutations exist.

## Documentation

- [Architecture and data boundaries](docs/architecture.md)
- [API and route contract](docs/api.md)
- [Production media pipeline and latency test method](docs/media-pipeline.md)
- [Deployment, scaling, caching and disaster recovery](docs/deployment.md)
- [Security, privacy and GDPR foundation](docs/security-privacy.md)
- [Event operations, ingestion, notifications and incident response](docs/operations.md)

## Known limitations

- This is a web demo with anonymous SSR plus one development-only, session-owned seeded profile, not completed registration/login/recovery or multi-device profile synchronization.
- Seed schedules use relative times at first insertion and are not connected to an authoritative live provider.
- WebRTC and LL-HLS are player/interface capabilities; local seed playback is standard HLS and does not exercise real protocol failover.
- HLS playback is unsigned in local development. There is no media-edge token verifier, geo-IP, DRM/license server or shared concurrency lease.
- Payments, plans and entitlements have data/policy foundations but no money movement or provider webhook.
- The PostgreSQL planner/worker implements starting-soon, started and followed-athlete in-app notices with scoped/global preference precedence and idempotent inserts. Schedule/venue-change and result/highlight rules exist but are not connected to an authoritative feed trigger; push/email delivery is absent.
- Playback authorization has no production token-refresh/revocation or media-edge lease-heartbeat integration.
- Admin/control content is read-only demo material, cannot change a production stream or contract, and returns 404 in production until SSO/RBAC is implemented.
- In-memory rate-limit/idempotency adapters are not safe across replicas.
- Browser/device coverage is intentionally small until production targets and DRM vendors are chosen.
- No production latency, scale, uptime, accessibility-conformance or security-penetration claim has been made.

## Next highest-value production steps

1. Integrate one contracted Estonian event end to end: authoritative schedule, redundant contribution, LL-HLS, signed edge authorization, geo/entitlement enforcement, caption path and measured device/network QoE.
2. Replace demo identity and process-local controls with a production identity provider, MFA for staff, server session/device management, Redis-backed rate/concurrency/idempotency and complete route-level authorization tests.
3. Operate one athlete-follow notification pilot using a contracted data feed and real push/email adapters, including DST, schedule-revision, deduplication, spoiler and delivery-delay evidence.
