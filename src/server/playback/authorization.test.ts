import { describe, expect, it } from "vitest";
import {
  appendPlaybackToken,
  mapDatabaseRightsWindow,
  normalizeHttpUrl,
  orderAuthorizationStreams,
  playerSourceKind,
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
  it("maps transport names and deterministically prefers ultra-low latency", () => {
    expect(playerSourceKind("webrtc")).toBe("whep");
    expect(playerSourceKind("ll_hls")).toBe("ll-hls");
    expect(orderAuthorizationStreams(streams).map((stream) => stream.id)).toEqual(["whep", "hls"]);
  });

  it("passes only an opaque stream id into rights resolution", () => {
    const mapped = mapDatabaseRightsWindow(baseRights, "event-1", "competition-1", streams, 4);
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
        "competition-1",
        [],
        1,
      ).delivery,
    ).toEqual({ kind: "external", url: "https://partner.example/watch", label: "Demo holder" });
    expect(
      mapDatabaseRightsWindow(
        { ...baseRights, access: "unavailable" },
        "event-1",
        "competition-1",
        streams,
        1,
      ).effect,
    ).toBe("deny");
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
