import { describe, expect, it } from "vitest";
import {
  createPlaybackPlan,
  findDataSaverCap,
  getHlsUrl,
  orderPlayerSources,
} from "./source-policy";
import type { PlayerSource } from "./types";

const sources: PlayerSource[] = [
  {
    id: "external",
    kind: "external",
    url: "https://rights-holder.example/event",
    providerName: "Rights holder",
  },
  { id: "hls", kind: "hls", url: "https://media.example/hls.m3u8" },
  {
    id: "ll-low-priority",
    kind: "ll-hls",
    priority: 20,
    url: "https://media.example/ll-2.m3u8",
  },
  { id: "whep", kind: "whep", url: "https://media.example/whep" },
  {
    id: "ll-high-priority",
    kind: "ll-hls",
    priority: 10,
    url: "https://media.example/ll-1.m3u8",
  },
];

describe("orderPlayerSources", () => {
  it("uses WHEP, LL-HLS, HLS, then an external destination", () => {
    expect(orderPlayerSources(sources).map((source) => source.id)).toEqual([
      "whep",
      "ll-high-priority",
      "ll-low-priority",
      "hls",
      "external",
    ]);
  });
});

describe("createPlaybackPlan", () => {
  it("marks an unconfigured WHEP source and keeps HLS fallbacks playable", () => {
    const plan = createPlaybackPlan(sources, {
      whepConfigured: false,
      nativeHls: false,
      hlsJs: true,
    });

    expect(plan[0]).toMatchObject({
      playableInline: false,
      reason: "whep_not_configured",
    });
    expect(plan[1]).toMatchObject({ playableInline: true, reason: "ready" });
    expect(plan.at(-1)).toMatchObject({
      playableInline: false,
      reason: "external_destination",
    });
  });
});

describe("data saver", () => {
  const levels = [
    { id: 0, height: 240, bitrate: 350_000 },
    { id: 1, height: 540, bitrate: 1_200_000 },
    { id: 2, height: 720, bitrate: 2_400_000 },
    { id: 3, height: 1080, bitrate: 5_500_000 },
  ];

  it("caps automatic playback at the best rendition inside both limits", () => {
    expect(findDataSaverCap(levels, { maxHeight: 720, maxBitrate: 1_500_000 })).toBe(1);
  });

  it("uses the lowest rendition when every rendition exceeds the cap", () => {
    expect(findDataSaverCap(levels, { maxHeight: 144, maxBitrate: 200_000 })).toBe(0);
  });

  it("selects an optional capped native-HLS playlist", () => {
    const source: PlayerSource = {
      id: "native",
      kind: "hls",
      url: "https://media.example/master.m3u8",
      dataSaverUrl: "https://media.example/mobile.m3u8",
    };

    if (source.kind !== "hls") throw new Error("Unexpected fixture");
    expect(getHlsUrl(source, true)).toBe("https://media.example/mobile.m3u8");
    expect(getHlsUrl(source, false)).toBe("https://media.example/master.m3u8");
  });
});
