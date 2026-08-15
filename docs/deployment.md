# Deployment and scaling

Last reviewed: 2026-08-15

This repository supplies a standalone Next.js container and a PostgreSQL schema. `docker-compose.yml` is a local PostgreSQL convenience, not a production platform. A production launch still needs contracted identity, payment, messaging and media providers; managed secrets, cache/lease storage, observability, backups and media rights.

## Supported local build

```bash
cp .env.example .env
# Replace both placeholder secrets in .env with different random values.
docker compose up -d --wait postgres
npm ci
npm run db:setup
npm run build
npm start
```

The application listens on `http://localhost:3000`. To exercise the development media controls, ensure FFmpeg is on `PATH` and run `npm run media:provider` in a second terminal; it listens on loopback port 8090 and serves only generated test media. It is a separate process and is not included in the Next.js container. Stop the database with `docker compose stop postgres`. `docker compose down` removes containers and the network but retains the named database volume; `docker compose down --volumes` destroys local database data and should be used only deliberately.

The database client is lazy and explicitly recognizes Next's production-build phase. When `DATABASE_URL` is absent during metadata collection, that phase may construct the client against an inert local default without connecting, so a database secret need not be baked into the image. A production runtime without `DATABASE_URL` fails closed. A successful build therefore does not prove runtime database readiness; the readiness probe is the deployment gate.

## Managed phone broadcasting on Vercel

This mode solves LAN firewall/client-isolation problems by separating the control and media paths:

```text
Phone browser -- WebRTC --> LiveKit Cloud SFU <-- WebRTC -- computer browsers
                             ^
                 Vercel: pages, authorization, room control and token signing
```

Vercel does not proxy or buffer the camera stream. Its functions use the LiveKit server API to create/delete a room, sign participant tokens and use PostgreSQL to map a short code to the room. The phone receives a room-bound publish-only token; every viewer lookup receives a fresh room-bound subscribe-only token with a unique identity. `LIVEKIT_API_SECRET` never reaches either browser.

1. In LiveKit Cloud, create a project and a new API key pair. Copy its project URL (`wss://<project>.livekit.cloud`) and put all three values directly into Vercel's secret store. Never commit them or prefix them with `NEXT_PUBLIC_`. If a key or secret has been pasted into chat, an issue, a log or a screen recording, revoke that pair in LiveKit first and create a replacement; deleting the message does not rotate a credential.
2. Attach a persistent PostgreSQL database that is reachable from Vercel. Set `DATABASE_URL`, then run `npm run db:migrate` once through a controlled release/migration job. Migration `0005_blue_sharon_carter.sql` creates `live_broadcasts`, `0006_worthless_miek.sql` adds the durable provider-cleanup marker, and `0007_damp_sinister_six.sql` adds the LiveKit Cloud provider and `wss://` locator constraint while retaining legacy rows. Do not make every web instance race migrations at startup.
3. Set these Vercel Production environment variables (plus the normal application variables):

```dotenv
APP_ORIGIN=https://your-stable-domain.example
PHONE_BROADCAST_ENABLED=true
PHONE_BROADCAST_PROVIDER=livekit-cloud
PHONE_BROADCAST_ACCESS_KEY=<strong private value, at least 12 characters>
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=<server-only LiveKit API key>
LIVEKIT_API_SECRET=<server-only LiveKit API secret>
```

`SESSION_SECRET` and `MEDIA_SIGNING_SECRET` must also be distinct random values of at least 32 characters. `APP_ORIGIN` must exactly match the URL in the phone's address bar; a different Vercel preview hostname fails the same-origin CSRF check. Prefer one stable custom domain for this test. `LIVEKIT_URL` must be the root `wss://` project URL on `*.livekit.cloud`, with no custom port, embedded credentials, path, query string or fragment.

4. Redeploy after setting the variables. When this provider is selected, the generated CSP permits `connect-src` to `https://*.livekit.cloud` and `wss://*.livekit.cloud`. The wildcard is required because the browser SDK fetches region settings and may connect to a provider-selected regional hostname; LiveKit's official [firewall guidance](https://docs.livekit.io/deploy/admin/firewall/) likewise requires `*.livekit.cloud` on TCP 443. The allowance is absent for the `direct` provider. Camera and microphone remain enabled only on the exact `/{et,en}/broadcast` document.
5. On the phone, open `https://your-stable-domain.example/et/broadcast`, enter the match name and `PHONE_BROADCAST_ACCESS_KEY`, choose the camera, and start. Keep that page open while filming.
6. On the computer, open `/et/broadcast/watch`. Select the match from the automatically refreshed list, enter its code, or open the viewing link copied from the phone. Each computer joins the same LiveKit room with its own subscribe-only token; viewers do not consume a single browser-to-browser slot.
7. Press **Stop broadcast** on the phone. The browser disconnects, the API marks the database row stopped and deletes the LiveKit room. Successful deletion is recorded; a transient provider failure leaves the row cleanup-pending. Later managed-broadcast traffic retries at most five pending rooms per request with a 30-second per-room backoff. Page shutdown is best effort, and six-hour expiry is enforced during later requests. A scheduled reconciliation job is still advisable before paid production use.

The publisher media token is scoped to its room with publish enabled and subscribe/data disabled. Viewer media tokens are scoped to the same room with subscribe enabled and publish/data disabled, use a fresh identity per lookup and cannot outlive the broadcast. Their initial-connect TTL is at most 10 minutes. Each room is capped at 51 participants and has an empty timeout of at most five minutes; with one phone publisher, the application cap is therefore 50 simultaneous viewers. The separate RADA `publisherToken` authorizes status/stop API calls. The shared broadcaster key is still only a practical personal-demo control, not staff authentication or moderation, and the process-local API limiter is not shared across Vercel instances. Replace both with real identity/RBAC, audience authorization and a distributed limiter before opening the feature to other people.

The LiveKit Cloud free **Build** plan currently includes **5,000 WebRTC participant minutes** and **50 GB downstream data transfer per month**. These are hard caps: new requests fail after an allowance is exceeded, rather than silently becoming paid overage. Every connected phone or viewer consumes participant time, so one hour with one phone and three viewers uses 240 participant minutes. Confirm the current values before a demo in LiveKit's official [quotas and limits](https://docs.livekit.io/deploy/admin/quotas-and-limits/) documentation. This repository does not start Egress or recording. Test a real phone/viewer session, latency, browser compatibility, quota telemetry and room cleanup on the deployed domain before relying on it for a match.

## Phone-camera LAN demo

The phone-camera demo is a direct browser WebRTC test path for one Android broadcaster and one computer viewer. It is available by default only in development. It is independent of the `media:provider` command: it does not use FFmpeg, HLS, the admin stream catalogue or port 8090, and the signaling server does not receive or record the media.

Prerequisites are the normal migrated/seeded PostgreSQL setup plus OpenSSL on `PATH`. Put the phone and computer on the same trusted Wi-Fi, then run this instead of `npm run dev`:

```bash
npm run dev:phone
```

The launcher:

- chooses an assigned non-loopback RFC1918 IPv4 address, preferring a physical interface over common virtual bridges; `PHONE_DEMO_HOST` can select another assigned private address;
- validates every host/port before passing argument arrays directly to OpenSSL/Next.js—no shell command interpolation;
- generates a 14-day constrained development CA and a three-day TLS server certificate with the selected IP, `localhost` and `127.0.0.1` SANs, or reuses them only when the host matches, the keys/certificates match, the chain verifies and more than 24 hours remain;
- stores private material below ignored `.local-certificates/` with 0700 directories and 0600 private keys;
- starts Next.js 16 development HTTPS on `0.0.0.0:3000`, setting `APP_ORIGIN=https://LAN-IP:3000` and allowing only that validated additional development origin; and
- starts a separate HTTP server bound to the selected LAN IP on port 3080. It serves only `GET/HEAD /rada-phone-demo-ca.crt` and `GET/HEAD /health`; all other paths return 404, so neither private keys nor a directory listing are exposed.

Optional overrides remain non-privileged and must be distinct:

```bash
PHONE_DEMO_HOST=192.168.1.42 \
PHONE_DEMO_PORT=3000 \
PHONE_DEMO_CA_PORT=3080 \
npm run dev:phone
```

### Android and computer workflow

1. Confirm the terminal prints the intended Wi-Fi IP. If it selected the wrong adapter, stop it and set `PHONE_DEMO_HOST` to an assigned private address.
2. On Android, open the printed `http://LAN-IP:3080/rada-phone-demo-ca.crt` URL. This initial download is unauthenticated HTTP, so use only a trusted LAN and compare the downloaded certificate's SHA-256 fingerprint with the terminal where Android exposes it. USB transfer of that public file is safer on a network you do not fully control.
3. Install it under the device's CA-certificate control, commonly **Settings → Security and privacy → More security settings → Encryption and credentials → Install a certificate → CA certificate**. Menu labels vary by Android vendor. The “network may be monitored” warning is real: the installed CA is a powerful trust decision, even though its private key stays on the development computer.
4. On the computer, download the same public CA and verify the printed fingerprint. Use a disposable demo browser/profile. Either import the CA into that browser's or operating system's trust store, or visit the exact `https://LAN-IP:3000` URL and explicitly accept its development-certificate interstitial if the browser permits an exception. Firefox can use its own certificate store even when the operating system trusts the CA. Never accept an unfamiliar certificate warning or install an unverified CA.
5. On the phone, open `https://LAN-IP:3000/et/broadcast` (or `/en/broadcast`), choose a camera, start, and grant camera/microphone permission. HTTPS is required for phone browser media capture.
6. On the computer, open the exact viewer link displayed by the phone, or open `https://LAN-IP:3000/et/broadcast/watch` and enter its formatted eight-character code. Both devices must use the same `https://LAN-IP:3000` origin; do not substitute `localhost` on the computer.
7. Stop on the phone before ending the launcher. Then remove **RADA Phone Demo CA** from Android and from the computer/browser if it was imported, and remove any saved browser certificate exception. Delete the local certificate directory too if it will not be reused.

The default local configuration offers direct host candidates only. There is no SFU, media server, server recording or second viewer. TCP 3000 and 3080 must be allowed through the computer firewall; Wi-Fi AP/client isolation, guest networks and VPN routing can block signaling or peer connectivity even when both devices show the same SSID. Never expose the development control/media-provider port 8090. Binding Next.js to the LAN also exposes other development routes, including the no-login admin view, so use a trusted private network and stop the launcher immediately after the demo.

For a protected production-shaped test of this legacy direct mode, set `PHONE_BROADCAST_ENABLED=true`, `PHONE_BROADCAST_PROVIDER=direct` and provide `PHONE_BROADCAST_ICE_SERVERS_JSON` as a JSON array of `RTCIceServer`-shaped objects. At least one authenticated `turn:` or `turns:` URL is required in production. TURN credentials necessarily reach participating browsers, so use short-lived credentials. The managed Vercel mode above does not use this setting.

The session expiry comes from the server and is currently 30 minutes. When it is reached, the phone stops its media tracks and peer connection and makes a best-effort delete request. Explicit Stop, navigation and page shutdown use the same deletion path, but a browser closing cannot guarantee delivery. Expired sessions fail closed: an exact later access deletes the row and returns `410`, while any later development signaling request opportunistically purges all expired rows. There is no independent periodic janitor, so bounded offer/answer SDP and its peer host candidates can remain in local PostgreSQL after expiry until one of those later requests or manual operational cleanup.

As a development alternative, `adb reverse tcp:3000 tcp:3000` lets the phone open the normal `http://localhost:3000/et/broadcast` while `npm run dev` runs on the computer; browsers treat localhost as a secure context, so this avoids installing a CA. The computer viewer also uses its normal localhost origin. Direct WebRTC still needs usable connectivity between device candidates, so USB forwarding alone does not replace a shared reachable network.

## Container image

`Dockerfile` uses a Node 22 multi-stage build and Next.js standalone output. Build it from the repository root:

```bash
docker build --tag rada-web:local .
```

Run the resulting image only with a PostgreSQL URL that is reachable **from the container**; `127.0.0.1` inside the container is not the host database.

```bash
docker run --rm --publish 3000:3000 \
  --env-file .env.production.local \
  rada-web:local
```

Do not put `.env.production.local` in source control or bake it into the image. Prefer the deployment platform's secret references over an environment file.

Local verification on 2026-08-14 built the image in 83.04 seconds. Inspection reported an approximately 82.99 MB image, numeric runtime user/group `1001:1001`, and no `.env` or scratch/test artifacts in the final filesystem. These are single-machine build facts, not a cold-start, portability, vulnerability-scan or production-performance claim.

## Required production topology

```text
DNS + DDoS/WAF
  -> regional load balancer
  -> 2+ stateless RADA web replicas across failure zones
       -> managed PostgreSQL primary + HA standby / read replicas
       -> shared atomic rate-limit, idempotency and playback-lease store
       -> notification/outbox workers
       -> schedule/results ingestion workers
       -> identity, payment, email and push providers
       -> metrics/traces/logging

Media authorization endpoint
  -> media edge / DRM license service
  -> protected origin + CDN(s)
```

Keep web and media data planes separate. Application autoscaling handles metadata and authorization requests, not video bandwidth.

The application deliberately returns 404 for `/{et,en}/admin` and its event/source/rights/provider mutation APIs when `NODE_ENV=production`; retain a matching perimeter denial. Keep these guards until staff SSO, MFA, server-side RBAC and attributable audited editorial/operator mutations are implemented and verified. The development view and loopback FFmpeg service are not production operations infrastructure.

## Environment and secrets

| Variable                           |   Required   | Production treatment                                                                                                                  |
| ---------------------------------- | :----------: | ------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                     |     yes      | TLS-enforced least-privilege role; use a pooled application URL and a separate migration role                                         |
| `SESSION_SECRET`                   |     yes      | >=32 random bytes, independent key, stored in secret manager, versioned rotation                                                      |
| `MEDIA_SIGNING_SECRET`             |     yes      | >=32 random bytes, distinct from session key; replace symmetric local design with managed/versioned media keys where vendor allows    |
| `APP_ORIGIN`                       |     yes      | canonical HTTPS origin; used for origin/CSRF policy                                                                                   |
| `PHONE_DEMO_HOST`                  |  local only  | optional assigned RFC1918 address selected by `dev:phone`; never accepted as an arbitrary hostname                                    |
| `PHONE_DEMO_PORT`                  |  local only  | optional non-privileged HTTPS application port; defaults to `3000`                                                                    |
| `PHONE_DEMO_CA_PORT`               |  local only  | optional non-privileged public-CA download port; defaults to `3080` and must differ from the application port                         |
| `PHONE_BROADCAST_ENABLED`          |  broadcast   | explicit production feature gate; keep false until the selected provider is fully configured                                          |
| `PHONE_BROADCAST_PROVIDER`         |  broadcast   | `direct` for the legacy one-viewer path or `livekit-cloud` for managed SFU broadcasting                                               |
| `PHONE_BROADCAST_ICE_SERVERS_JSON` | direct only  | authenticated TURN configuration required when the direct provider is enabled in production                                           |
| `PHONE_BROADCAST_ACCESS_KEY`       | managed only | >=12-character server-validated broadcaster secret; temporary substitute for real staff authentication                                |
| `LIVEKIT_URL`                      | managed only | root project `wss://*.livekit.cloud` URL; no port, credentials, additional path, query or fragment                                    |
| `LIVEKIT_API_KEY`                  | managed only | server-side LiveKit key used to identify signed room tokens and authorize room control; never use a `NEXT_PUBLIC_` variable           |
| `LIVEKIT_API_SECRET`               | managed only | server-only LiveKit signing/control secret; keep in Vercel's sensitive secret store and rotate immediately after any disclosure       |
| `DEFAULT_COUNTRY`                  |     yes      | conservative two-letter fallback; unknown geo should fail closed when rights require territory certainty                              |
| `LOG_LEVEL`                        |     yes      | normally `info`; temporary debug logging must preserve redaction                                                                      |
| `MEDIA_PROVIDER_URL`               | local/media  | paired with `MEDIA_PROVIDER_TOKEN`; loopback HTTP is permitted only outside production, while production configuration requires HTTPS |
| `MEDIA_PROVIDER_TOKEN`             | local/media  | >=32-character server-only bearer credential; never expose it to the browser or commit a production value                             |
| `LOCAL_MEDIA_PROVIDER_HOST`        |  local only  | loopback bind for the supplied synthetic service; do not expose it publicly                                                           |
| `LOCAL_MEDIA_PROVIDER_PORT`        |  local only  | defaults to `8090`; must match the configured adapter/network policy                                                                  |
| `LOCAL_MEDIA_PROVIDER_PUBLIC_URL`  |  local only  | base URL placed in generated playback locators; defaults to the loopback provider                                                     |
| `REDIS_URL`                        | integration  | TLS/authenticated shared store, private network and explicit key TTLs                                                                 |
| `PAYMENT_PROVIDER`                 | integration  | adapter selection only; credentials arrive through separate secret references                                                         |
| `PUSH_PROVIDER`                    | integration  | adapter selection only; encrypt device tokens at rest                                                                                 |
| `EMAIL_PROVIDER`                   | integration  | adapter selection only; use signed/verified webhook callbacks                                                                         |

The current environment schema rejects HTTP production origins/provider URLs, an unsafe LiveKit URL, short secrets, matching session/media secrets, unpaired media-provider URL/token values and obvious placeholder secret values. For a LiveKit key-pair rotation, create the replacement, update Vercel, redeploy and verify room creation/viewing before deleting the old pair. Revoke first when exposure is suspected, accepting interruption as the safer outcome. Session/media signing keys need an overlapping versioned rotation design; a single unversioned replacement logs out users or interrupts playback.

## Database release process

1. Generate and review a migration in the same change as its schema usage.
2. Test it against a recent anonymized production-sized snapshot; measure locks and duration.
3. Take/verify a recoverable backup and replication health.
4. Run forward-compatible expand migrations with a dedicated migration identity as a one-off release job.
5. Deploy code that can read old/new states during the rollout.
6. Backfill in bounded resumable batches outside the request path.
7. Enforce new constraints and remove old columns only in a later release.

Never have every web replica race to run migrations at startup. Drizzle migration state must be backed up with the database. Seed scripts are for local/demo environments and must be disabled in production.

## CI/CD stages

The checked-in GitHub Actions workflow installs the lockfile, checks formatting/lint/types, runs coverage-gated tests, migrates/seeds an isolated PostgreSQL service, builds the production bundle, installs and verifies FFmpeg, and executes Playwright on mobile and desktop Chromium profiles. A production delivery pipeline should add:

1. dependency, secret, license, SAST and container scanning;
2. image build once, provenance/SBOM generation and signing;
3. deployment of that immutable digest to a production-like staging environment;
4. migration dry-run, smoke, rights/entitlement, accessibility and playback canary tests;
5. manual approval for production rights/media changes;
6. progressive rollout (internal -> 1% -> 10% -> 50% -> 100%) governed by error/latency guardrails; and
7. automated rollback of application replicas when guardrails fail.

Database changes and contractual rights changes often cannot be rolled back by changing the container. Each requires its own forward-repair and emergency-disable procedure.

## Caching rules

| Response                                  | Shared-cache policy                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Public sports/competition catalogue       | short `s-maxage` plus stale-while-revalidate; purge by entity revision              |
| Public schedule                           | short TTL, locale/filter-aware key, purge immediately on accepted schedule revision |
| Artwork and versioned static assets       | long immutable cache                                                                |
| Profile feed, follows, notifications      | `private, no-store`                                                                 |
| Entitlements, sessions, devices           | `private, no-store`                                                                 |
| Playback authorization and media redirect | `private, no-store`, no token in logs                                               |
| Live manifest/parts/segments              | media-vendor protocol-specific edge rules, never application cache                  |

Do not vary a shared cache merely on a cookie while still permitting storage. Generate genuinely public and personalized payloads through separate endpoints.

## Autoscaling and peak preparation

- Scale web replicas on request concurrency plus p95 latency, not CPU alone. Establish per-pod connection budgets so autoscaling cannot exhaust PostgreSQL.
- Precompute/public-cache today's Tallinn schedule and editorial collections; paginate long date ranges with stable cursors.
- Use an outbox and independently scaled workers for schedule fan-out and notifications.
- Batch status distribution over server-sent events or another bounded fan-out layer when live polling load warrants it. Clients use jittered backoff and visibility-aware polling as a fallback.
- Acquire playback concurrency atomically in a shared store. Pre-size token authorization and refresh traffic for synchronized starts.
- Run load rehearsals at 2x the forecast authenticated starts per minute and include a cache-cold scenario. Forecasts and achieved capacity must be written into the event readiness record.
- Pre-warm media CDN/origin separately. Next.js capacity says nothing about segment egress capacity.

## Availability, backup and disaster recovery

Initial objectives, pending production measurement and business approval:

| System                  | Design objective                                   | Notes                                                    |
| ----------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| Public/event API        | 99.95% monthly availability during service windows | multi-zone web and HA database                           |
| Playback authorization  | 99.99% during contracted priority events           | conservative, no shared cache                            |
| Metadata recovery point | <=5 minutes                                        | continuous WAL/archive; confirm provider guarantees      |
| Metadata recovery time  | <=60 minutes                                       | rehearse region/account restoration                      |
| Notification delay      | p95 <=60 seconds from accepted source change       | excludes upstream source delay but reports it separately |

Back up PostgreSQL with point-in-time recovery and immutable cross-account/cross-region copies according to the final retention schedule. Quarterly, restore into an isolated account, validate row counts/constraints and exercise application readiness—successful backup jobs alone do not prove recovery.

Media archives follow contract-specific retention. Replicate only when rights permit it; deletion must reach origins, CDN caches, derivative assets and backups according to the contract and privacy policy.

## Health probes

- Liveness answers when the process/event loop can accept work; it must not fail solely because PostgreSQL is briefly down.
- Readiness verifies configuration and critical request dependencies with a tight timeout. Remove an unready replica from new traffic.
- Deep dependency/media probes belong in monitoring, not the load balancer's high-frequency health check.
- Never expose secret values, detailed stack traces, database names or vendor internals from public health responses.

## Launch gate

- [ ] Rights contracts and per-event rights records are approved by legal/editorial owners.
- [ ] Production identity, payment, messaging, geo, shared-state, media and DRM adapters pass staging tests.
- [ ] A contracted encoder/origin/CDN provider replaces the loopback synthetic registry entry, with reconciliation, failover and signed delivery tested.
- [ ] Staff SSO/MFA, route-level RBAC and audit enforcement are complete before replacing the production admin hard-404.
- [ ] Database migration and point-in-time restore are rehearsed.
- [ ] Signing-key rotation and emergency media revocation are rehearsed.
- [ ] Capacity test passes with documented event forecast and safety factor.
- [ ] Web/player device and accessibility matrix passes.
- [ ] DPIA, processor agreements, privacy notice, consent and retention jobs are approved.
- [ ] Dashboards, alerts, support diagnostics, status communications and on-call contacts are ready.
- [ ] Event-specific ingest/CDN failover game-day rehearsal passes.
- [ ] Measured results replace targets in the release evidence; no latency claim is published from a local demo.
