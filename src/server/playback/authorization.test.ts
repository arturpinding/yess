import { describe, expect, it } from "vitest";
import {
  appendPlaybackToken,
  isPlayableAuthorizationStreamState,
  mapDatabaseRightsWindow,
  normalizeHttpUrl,
  orderAuthorizationStreams,
  playerSourceKind,
  resolvePlaybackRights,
  type AuthorizationStream,
  type DatabaseRightsWindow,
} from "./authorization";

const streams: AuthorizationStream[] = [
  {
    id: "hls",
    protocol: "hls",
    state: "live",
    priority: 20,
    playbackLocator: "https://media.example/master.m3u8",
    externalWatchUrl: null,
    provider: "origin",
    requiresSignedAccess: true,
    dvrWindowSeconds: 300,
    captionsAvailable: false,
    audioTracks: [],
  },
  {
    id: "whep",
    protocol: "webrtc",
    state: "live",
    priority: 30,
    playbackLocator: "https://media.example/whep",
    externalWatchUrl: null,
    provider: "origin",
    requiresSignedAccess: true,
    dvrWindowSeconds: 0,
    captionsAvailable: false,
    audioTracks: [],
  },
];

const baseRights: DatabaseRightsWindow = {
  id: "rights-1",
  competitionId: null,
  eventId: "event-1",
  streamId: null,
  mediaAssetId: null,
  contentKind: "live",
  countryCode: "ee",
  access: "free",
  requiredProductId: null,
  startsAt: new Date("2026-08-14T09:00:00.000Z"),
  endsAt: new Date("2026-08-14T12:00:00.000Z"),
  dvrAllowed: true,
  maxConcurrentStreams: 2,
  externalWatchUrl: null,
  rightsHolder: "Demo holder",
  priority: 10,
};

describe("playback authorization mapping", () => {
  it.each([
    ["ready", true],
    ["live", true],
    ["degraded", true],
    ["provisioning", false],
    ["ended", false],
    ["unavailable", false],
  ] as const)("treats %s stream state playability as %s", (state, expected) => {
    expect(isPlayableAuthorizationStreamState(state)).toBe(expected);
  });

  it("maps transport names and deterministically prefers ultra-low latency", () => {
    expect(playerSourceKind("webrtc")).toBe("whep");
    expect(playerSourceKind("ll_hls")).toBe("ll-hls");
    expect(orderAuthorizationStreams(streams).map((stream) => stream.id)).toEqual(["whep", "hls"]);
  });

  it("passes only an opaque stream id into rights resolution", () => {
    const mapped = mapDatabaseRightsWindow(baseRights, "event-1", streams, 4);
    expect(mapped.delivery).toEqual({ kind: "internal", streamId: "whep" });
    expect(JSON.stringify(mapped)).not.toContain("media.example");
    expect(mapped.territory).toEqual({ mode: "include", countryCodes: ["ee"] });
  });

  it("maps external and explicit unavailable rights without manufacturing internal access", () => {
    expect(
      mapDatabaseRightsWindow(
        {
          ...baseRights,
          access: "external_only",
          externalWatchUrl: "https://partner.example/watch",
        },
        "event-1",
        [],
        1,
      ).delivery,
    ).toEqual({ kind: "external", url: "https://partner.example/watch", label: "Demo holder" });
    expect(
      mapDatabaseRightsWindow({ ...baseRights, access: "unavailable" }, "event-1", streams, 1)
        .effect,
    ).toBe("deny");
  });

  it("keeps stream-targeted policy scoped to its exact source", () => {
    const mapped = mapDatabaseRightsWindow(
      { ...baseRights, eventId: null, streamId: "hls" },
      "event-1",
      streams,
      3,
      "whep",
    );

    expect(mapped.scope).toEqual({ kind: "stream", streamId: "hls" });
    expect(mapped.delivery).toEqual({ kind: "internal", streamId: "hls" });
  });

  it("falls back after a source-specific denial and applies competition policy to the fallback", () => {
    const resolution = resolvePlaybackRights(
      [
        { ...baseRights, id: "deny-whep", eventId: null, streamId: "whep", access: "unavailable" },
        {
          ...baseRights,
          id: "competition-allow",
          eventId: null,
          competitionId: "competition-1",
        },
      ],
      streams,
      {
        profileId: "profile-1",
        eventId: "event-1",
        competitionId: "competition-1",
        sportId: "sport-1",
        contentType: "live",
        countryCode: "EE",
        now: new Date("2026-08-14T10:00:00.000Z"),
        entitlements: [],
        activePlaybackCount: 0,
      },
      5,
    );

    expect(resolution).toMatchObject({
      allowed: true,
      stream: { id: "hls" },
      delivery: { kind: "internal", streamId: "hls" },
      window: { id: "competition-allow" },
    });
  });

  it("lets an explicit stream allow outrank an event deny without bypassing that deny elsewhere", () => {
    const resolution = resolvePlaybackRights(
      [
        { ...baseRights, id: "event-deny", access: "unavailable", priority: 500 },
        { ...baseRights, id: "allow-hls", eventId: null, streamId: "hls", priority: 1 },
      ],
      streams,
      {
        profileId: "profile-1",
        eventId: "event-1",
        competitionId: "competition-1",
        sportId: "sport-1",
        contentType: "live",
        countryCode: "EE",
        now: new Date("2026-08-14T10:00:00.000Z"),
        entitlements: [],
        activePlaybackCount: 0,
      },
      5,
    );

    expect(resolution).toMatchObject({
      allowed: true,
      stream: { id: "hls" },
      window: { id: "allow-hls" },
    });
  });

  it("fails closed with the first ordered denial when every candidate is denied or unmatched", () => {
    const resolution = resolvePlaybackRights(
      [{ ...baseRights, id: "deny-whep", eventId: null, streamId: "whep", access: "unavailable" }],
      streams,
      {
        profileId: "profile-1",
        eventId: "event-1",
        competitionId: "competition-1",
        sportId: "sport-1",
        contentType: "live",
        countryCode: "EE",
        now: new Date("2026-08-14T10:00:00.000Z"),
        entitlements: [],
        activePlaybackCount: 0,
      },
      5,
    );

    expect(resolution).toEqual({
      allowed: false,
      reason: "rights-denied",
      windowId: "deny-whep",
    });
  });

  it("keeps external-only delivery available without a playable internal source", () => {
    const resolution = resolvePlaybackRights(
      [
        {
          ...baseRights,
          access: "external_only",
          externalWatchUrl: "https://partner.example/watch",
        },
      ],
      streams.map((stream) => ({ ...stream, state: "ended" as const })),
      {
        profileId: "profile-1",
        eventId: "event-1",
        competitionId: "competition-1",
        sportId: "sport-1",
        contentType: "live",
        countryCode: "EE",
        now: new Date("2026-08-14T10:00:00.000Z"),
        entitlements: [],
        activePlaybackCount: 0,
      },
      5,
    );

    expect(resolution).toMatchObject({
      allowed: true,
      stream: null,
      delivery: { kind: "external", url: "https://partner.example/watch" },
    });
  });

  it("preserves stream-scoped external-only delivery without reviving its ended transport", () => {
    const ended = { ...streams[0]!, state: "ended" as const };
    const resolution = resolvePlaybackRights(
      [
        {
          ...baseRights,
          eventId: null,
          streamId: ended.id,
          access: "external_only",
          externalWatchUrl: "https://partner.example/stream-fallback",
        },
      ],
      [ended],
      {
        profileId: "profile-1",
        eventId: "event-1",
        competitionId: "competition-1",
        sportId: "sport-1",
        contentType: "live",
        countryCode: "EE",
        now: new Date("2026-08-14T10:00:00.000Z"),
        entitlements: [],
        activePlaybackCount: 0,
      },
      5,
    );

    expect(resolution).toMatchObject({
      allowed: true,
      stream: null,
      delivery: { kind: "external", url: "https://partner.example/stream-fallback" },
    });
  });

  it("never authorizes an ended source", () => {
    const ended = { ...streams[0]!, state: "ended" as const };
    const resolution = resolvePlaybackRights(
      [{ ...baseRights, eventId: null, streamId: ended.id }],
      [ended],
      {
        profileId: "profile-1",
        eventId: "event-1",
        competitionId: "competition-1",
        sportId: "sport-1",
        contentType: "live",
        countryCode: "EE",
        now: new Date("2026-08-14T10:00:00.000Z"),
        entitlements: [],
        activePlaybackCount: 0,
      },
      5,
    );

    expect(resolution).toEqual({ allowed: false, reason: "no-rights" });
  });

  it("appends a token without discarding existing query parameters", () => {
    const url = appendPlaybackToken(
      "/media/live.m3u8?edge=ee",
      "signed-token",
      "https://rada.test",
    );
    expect(url).toBe("https://rada.test/media/live.m3u8?edge=ee&access_token=signed-token");
  });

  it("rejects script, data and malformed playback destinations", () => {
    expect(normalizeHttpUrl("javascript:alert(1)", "https://rada.test")).toBeNull();
    expect(normalizeHttpUrl("data:text/html,unsafe", "https://rada.test")).toBeNull();
    expect(normalizeHttpUrl("https://media.example/live.m3u8", "https://rada.test")).toBe(
      "https://media.example/live.m3u8",
    );
    expect(() =>
      appendPlaybackToken("javascript:alert(1)", "signed-token", "https://rada.test"),
    ).toThrow("Playback locator must use HTTP or HTTPS");
  });
});
