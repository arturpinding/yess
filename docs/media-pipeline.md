# Production media pipeline

Last reviewed: 2026-08-14

This document is the production design for RADA's media data plane. The repository does **not** contain encoders, contribution links, an origin, CDN contracts, DRM, a geo-IP service, or media rights. Local development uses a clearly labelled public test HLS asset and an inert external-destination placeholder; production may use only verified official destinations. A successful local player test does not demonstrate production glass-to-glass latency.

## End-to-end path

```text
Venue cameras / host feed
  -> redundant contribution encoders
  -> primary + backup network paths
  -> ingest gateways
  -> signal and policy validation
  -> redundant live transcoders
  -> CMAF packaging + WebRTC SFU/egress
  -> protected origin(s)
  -> CDN / multi-CDN edge
  -> RADA player
        WHEP/WebRTC -> LL-HLS -> standard HLS -> official external destination
```

RADA's Next.js API is the control plane. It evaluates rights and entitlements and issues a short-lived playback authorization. It must never carry live media segments through an application server.

## 1. Contribution and ingest

### Venue acquisition

- Obtain only feeds covered by a signed contribution and distribution agreement. Record contract ID, territories, content types, blackout rules, recording/DVR permission, valid window and takedown contact.
- Synchronize encoders and production equipment to a monitored time source. Embed timecode needed for glass-to-glass measurement; player live-edge estimates are not a latency measurement.
- Use two hardware or separately isolated software encoders for priority events, powered from independent circuits/UPS where feasible.
- Send primary and backup contributions over diverse paths (for example wired venue internet plus bonded cellular from different carriers). A backup using the same last-mile circuit is not redundant.
- Prefer SRT or RIST with encryption for managed internet contribution. Use RTMP only where a source cannot supply a modern resilient protocol; rotate credentials per event. WebRTC contribution is appropriate where sub-second interaction matters and the production vendor supports it.
- Authenticate every publishing endpoint. Ingest URLs/keys belong in a secret manager and must never be present in browser code, source control, logs or support screenshots.

### Admission and validation

Before promoting an ingest to air, validate:

- the scheduled event, source identity and contract window;
- expected video codec, resolution, frame rate, keyframe interval and color signalling;
- audio presence, level, channel layout, loudness, language labels and A/V sync;
- timestamp monotonicity, continuity counters and caption/data tracks;
- bitrate bounds, frozen/black frames, silence and source dropouts;
- primary/backup semantic equivalence; and
- malware/type validation for any uploaded replay, caption or image asset.

Invalid sources remain quarantined from the public origin. Operators see a stable error code and validation evidence, not the ingest secret.

## 2. Encoding and transcoding

Create an aligned adaptive bitrate ladder per source quality. The initial ladder below is a capacity-planning starting point, not a universal prescription; validate it with objective quality metrics and real sports motion.

| Profile | Video                                  | Approx. video bitrate |            Audio | Intended use               |
| ------- | -------------------------------------- | --------------------: | ---------------: | -------------------------- |
| 240p    | 426x240, 25/30 fps                     |          300–450 kb/s |   AAC 48–64 kb/s | severe constraint          |
| 360p    | 640x360, 25/30 fps                     |          650–900 kb/s |      AAC 64 kb/s | data saver/mobile          |
| 540p    | 960x540, 25/30 fps                     |          1.2–1.8 Mb/s |      AAC 96 kb/s | constrained mobile         |
| 720p    | 1280x720, 50 fps where source permits  |          2.5–4.0 Mb/s |     AAC 128 kb/s | normal mobile/desktop      |
| 1080p   | 1920x1080, 50 fps where source permits |          5.0–8.0 Mb/s | AAC 128–192 kb/s | large screen/sports motion |

- Keep IDR/keyframe boundaries aligned across every rendition so ABR switches do not stall.
- Use a 2-second GOP as an initial HLS design point. LL-HLS uses CMAF parts around 333–500 ms; tune only after end-to-end tests across the CDN and device matrix.
- Do not upscale a poor source. Remove renditions that provide no quality benefit.
- H.264/AAC is the broad-compatibility baseline. HEVC/AV1 may be additive where device support, licensing cost and energy impact are measured; never make them the only path without a supported fallback.
- Generate a deliberately capped data-saver multivariant playlist or enforce a tested rendition cap in the player.
- Maintain at least N+1 transcoding capacity for important live events. Primary and backup jobs must not share the same failure domain.

## 3. Packaging and protocols

### LL-HLS: scalable default

- Package CMAF fragmented MP4 with partial segments, blocking playlist reload and rendition reports.
- Publish a low-latency playlist and a standard-latency compatibility playlist from the same aligned media where the vendor supports it.
- Set CDN cache rules independently for master playlists, rapidly changing media playlists, parts, complete segments and immutable VOD assets.
- Preserve DVR content only for the contractual window. The UI and seekable range must obey the rights decision, not merely whatever remains at the origin.

### WebRTC/WHEP: ultra-low-latency option

- Expose an authorized WHEP endpoint through an SFU/media service for events that need under-two-second delivery and can carry the scaling/cost trade-off.
- Use ICE over UDP first with TURN/TLS fallback. Operate geographically appropriate relay capacity and monitor relay saturation.
- Supply an injectable WHEP connector to the browser player; the repository's player intentionally falls through when one is not configured.
- WebRTC and HLS must point to the same event timeline and commentary state. Switching protocol must not change entitlement or territory policy.
- Offer LL-HLS/HLS whenever WebRTC negotiation, codec support, enterprise firewalls or capacity prevent playback.

### Standard HLS fallback

- Maintain a compatible HLS path for Safari/native playback and devices or networks that cannot sustain the low-latency path.
- Keep fallback playlists independently health-checked; generating a URL is not proof that segments are advancing.

## 4. Origin and CDN

- Use a protected origin that rejects direct anonymous access. Permit only packagers and authorized CDN identities.
- Use origin shielding and separate failure domains for primary and backup origins. Replicate manifests/segments or provide deterministic origin failover with continuity tested under load.
- Prefer two CDN vendors for nationally important peaks if contracts and operational maturity justify it. Steering uses measured regional health and must avoid thrashing clients between edges.
- Pre-warm DNS/TLS and the first manifests shortly before a scheduled start; do not download video before user intent.
- Cache public immutable VOD segments for long durations. Live manifests and parts use protocol-appropriate short freshness. Playback authorization, personalized metadata and entitled responses are `private, no-store`.
- Strip authentication query strings and headers from access logs or hash/tokenize the minimum identifier needed for abuse analysis.

## 5. Authorization, DRM and territorial policy

Playback requires a server-side decision in this order:

1. resolve authenticated account/profile and age policy;
2. derive country from a trusted edge geo-IP signal, not the browser payload;
3. load active rights for event/competition, content type and half-open time window;
4. verify product entitlement and revocation;
5. atomically acquire a concurrency lease for the profile/account/device policy;
6. mint a 15–120 second authorization bound to event, stream, rights window, country, allowed protocols, policy version and unique ID; and
7. have the media edge or authorization service verify that token before returning a manifest/session.

Use signed cookies when many segment URLs share one authorization domain; use signed URLs for a narrowly scoped object or vendor contract that requires them. Do not put stable user IDs, email, product names, secrets or long-lived bearer tokens in media URLs.

The implemented API never returns the raw playback JWT as its own JSON field. For a stream marked as requiring signed access, it embeds the short-lived claim in the authorized source locator; an unsigned public demo returns only its public locator. Both playback locators and official legal-handoff destinations are parsed and restricted to HTTP(S). Production policy must narrow this further to HTTPS and approved provider hosts, and the edge must independently validate the claim before serving protected media.

For premium content, integrate the browser's Encrypted Media Extensions with a multi-DRM service: Widevine, FairPlay and PlayReady as required by the target-device matrix. License requests repeat the rights/entitlement/session checks and are short lived. DRM is an enforcement tool, not a substitute for rights contracts, accessibility copies, secure key management or takedown operations.

Geo enforcement needs:

- a contracted, regularly refreshed geo-IP database/service at the trusted edge;
- rules for unknown territory, VPN/proxy signals and roaming agreed with rights holders;
- consistent checks at authorization, manifest/license access and token refresh; and
- privacy notices and a documented appeal/support path for false positives.

Concurrency needs an atomic shared lease keyed to the contractual subject. Heartbeats extend a short TTL; disconnect/logout explicitly releases it; expiry recovers abandoned sessions. A database count read followed by insert is race-prone and is not sufficient at peak traffic.

## 6. Recording, replay and highlights

- Record the mezzanine or highest justified contribution plus redundant packaged output when the contract permits recording.
- Segment recordings continuously to reduce loss when an encoder fails. Write immutable checksums and retention metadata.
- Generate replay manifests only after validating completeness, A/V sync, caption continuity and rights window.
- Create highlights from editorially approved in/out points. Keep provenance to event, source asset, operator and revision.
- Independently model live, replay and highlight rights. A live license does not imply catch-up, clips, social publishing or indefinite archive rights.
- At rights expiry, stop new authorization, invalidate edge access, withdraw search/editorial references as contracted, and execute deletion/retention jobs with auditable evidence.

## 7. Captions and audio

- Carry correctly labelled language tracks end to end. At minimum, preserve the host audio; add Estonian commentary only with the necessary production and rights agreement.
- Support WebVTT for HLS browser delivery and IMSC1/TTML where the distribution ecosystem requires it.
- Monitor caption presence, cue timing, overlap, readability and continuity across failover.
- Preserve alternate commentary and audio-description tracks where available; do not label a track until it has been editorially verified.
- Provide a manual correction workflow and keep the original caption asset for audit.

## 8. Player behavior

The implemented player abstraction orders authorized candidates as WHEP/WebRTC, LL-HLS, HLS, then official external destination. It supports native HLS or `hls.js`, automatic/manual rendition selection, an optional data cap, recovery/fallback, live-edge estimate and jump-to-live, rights-controlled DVR seeking, picture-in-picture, fullscreen, captions/audio selection, keyboard controls, offline/unavailable states, and a telemetry callback.

Important limits:

- the repository does not provide a WHEP connector or WebRTC infrastructure;
- a public test HLS manifest does not exercise signed media access, DRM, geo rules or production failover;
- the displayed live-edge distance is calculated from the media seekable range and is **not** glass-to-glass latency; and
- browser support varies, so the production device matrix must be tested with real streams and DRM.

Collect the minimum operational playback telemetry under a documented service/security purpose; gate optional product analytics on consent. Useful fields are event/stream pseudonymous IDs, protocol, player version, startup time, playback time, rebuffer duration/count, fatal error code, selected rendition, estimated live-edge distance and recovery result. Do not collect page keystrokes, exact IP in product analytics, full media URLs/tokens, or account contact data.

## 9. Health, monitoring and objectives

### Media health probes

Probe every public variant from at least two networks/regions and verify:

- manifest freshness and segment progression;
- HTTP status, DNS/TLS/connect/first-byte times and cache outcome;
- bitrate/resolution declarations and segment duration drift;
- decode success, black/frozen frames, audio silence and A/V sync;
- WebRTC ICE/DTLS connection, packet loss, jitter, RTT and frames decoded;
- caption and alternate-audio presence; and
- primary/backup continuity.

### Product SLIs and initial objectives

These are launch targets, not measured results:

| SLI                                       | Initial design target                                                | Measurement                                              |
| ----------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- |
| Glass-to-glass latency, WebRTC            | p75 < 2 s where provisioned                                          | camera timecode compared with decoded frame              |
| Glass-to-glass latency, LL-HLS            | p75 2–5 s                                                            | same timecode method, by device/network                  |
| Glass-to-glass latency, HLS               | p75 6–15 s                                                           | same timecode method, by device/network                  |
| Video startup                             | p75 < 2.5 s, p95 < 5 s on defined Estonian broadband/mobile profiles | navigation/user intent to first rendered frame           |
| Video start success                       | >= 99.5% for authorized starts                                       | eligible start attempts excluding explicit rights denial |
| Rebuffer ratio                            | p75 < 0.5%, p95 < 2%                                                 | stalled playback duration / playing duration             |
| Fatal playback errors                     | < 0.5% of authorized sessions                                        | unrecovered terminal player errors                       |
| Recovery from source/network interruption | p95 < 8 s where a healthy fallback exists                            | fault injection and RUM                                  |
| Live manifest availability                | >= 99.95% during contracted live windows                             | multi-region synthetic probes                            |

Do not publish these as achieved until the test matrix, sample size, exclusions, percentile calculation and observation period are recorded.

## 10. Test programme

Before a production event:

1. **Lab:** test Safari, Chrome, Firefox and Edge plus agreed iOS/Android/tablet/TV devices; native HLS, `hls.js`, WHEP, captions, audio, PiP/fullscreen, data saver and keyboard/screen reader controls.
2. **Network shaping:** validate startup, ABR down/up shifts and recovery at 4G/5G, DSL-like throughput, high RTT, jitter, packet loss, brief outage and IP handoff.
3. **Latency:** film a trusted UTC/timecode source at ingest and compare it with the rendered player frame. Run enough samples for percentiles; never substitute seekable-edge estimates.
4. **Failover:** kill primary encoder, contribution path, transcoder, packager, origin, CDN route and authorization dependency one at a time. Measure discontinuity and data loss.
5. **Load:** model synchronized starts before a major Estonian event, token refreshes, manifest requests and segment egress. Include cache-cold and origin-shield failure scenarios.
6. **Policy:** test rights opening/expiry, territory unknown/blocked, entitlement revoke, concurrency race, DVR disabled, replay-only windows and external destination allow-listing.
7. **Accessibility:** test captions, labels, focus order, visible focus, controls at 200% zoom, high contrast and reduced motion.
8. **Game day rehearsal:** run the production chain with the actual venue/team, contact tree, dashboards and rollback/takedown controls.

## 11. Incident response

### Severity

- **SEV-1:** widespread inability to start/watch a priority live event; unauthorized territorial/content exposure; compromised signing/DRM key.
- **SEV-2:** material degradation, one protocol/CDN unavailable with fallback, major A/V/caption fault, delayed metadata affecting many viewers.
- **SEV-3:** localized device issue, noncritical rendition fault, isolated schedule/support problem.

### First-response sequence

1. Declare severity, incident commander, media lead and communications lead; timestamp actions in the incident channel.
2. Confirm viewer impact from independent probes and player telemetry; distinguish source, control-plane, CDN and device failure.
3. Preserve event context in the UI. Move viewers to a verified backup protocol/CDN or the rights holder's official destination.
4. If unauthorized access is possible, revoke policy/token keys or withdraw manifests according to the pre-approved emergency procedure; contact the rights holder.
5. Keep updates factual: affected event/territory/device, workaround and next-update time. Do not expose security details or guess a recovery time.
6. After recovery, verify every rendition/audio/caption path, close temporary access, preserve evidence, and run a blameless review within two business days.

### Prepared runbooks

Maintain tested runbooks for ingest loss, encoder switch, transcoder/packager failover, stale manifest, CDN steering, WebRTC capacity exhaustion, excessive latency/rebuffering, DRM/license failure, geo false positive, concurrency-store failure, rights takedown, caption loss, signing-key compromise and mass schedule correction. Every runbook has an owner, last rehearsal date and rollback step.
