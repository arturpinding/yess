import type { AdminStreamRecord, StreamConfiguration } from "./stream-control";
import {
  createAdminStreamSchema,
  deleteAdminStreamSchema,
  isProviderReferenceConflict,
  mergeStreamConfiguration,
  streamConfigurationSchema,
  toAdminStreamDto,
  toAuditSnapshot,
  updateAdminStreamSchema,
} from "./stream-control";

const internalConfiguration: StreamConfiguration = {
  protocol: "ll_hls",
  state: "ready",
  priority: 10,
  playbackLocator: "https://media.example.test/live/master.m3u8",
  externalWatchUrl: null,
  provider: "demo-origin",
  providerStreamRef: "event-primary",
  requiresSignedAccess: true,
  dvrWindowSeconds: 1_800,
  captionsAvailable: true,
};

function streamRecord(overrides: Partial<AdminStreamRecord> = {}): AdminStreamRecord {
  const timestamp = new Date("2026-08-14T12:00:00.000Z");
  return {
    id: "10000000-0000-4000-8000-000000000001",
    eventId: "20000000-0000-4000-8000-000000000001",
    protocol: "ll_hls",
    state: "ready",
    priority: 10,
    playbackLocator:
      "https://media.example.test/live/master.m3u8?token=secret&policy=private#signed-fragment",
    externalWatchUrl: null,
    provider: "demo-origin",
    providerStreamRef: "event-primary",
    requiresSignedAccess: true,
    dvrWindowSeconds: 1_800,
    captionsAvailable: true,
    audioTracks: [],
    isDemo: true,
    lastHealthyAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    eventTitleEt: "Näidissündmus",
    eventTitleEn: "Demo event",
    ...overrides,
  };
}

describe("admin stream-control contract", () => {
  it("accepts complete internal and external stream configurations", () => {
    expect(streamConfigurationSchema.safeParse(internalConfiguration).success).toBe(true);
    expect(
      streamConfigurationSchema.safeParse({
        ...internalConfiguration,
        protocol: "external",
        playbackLocator: null,
        externalWatchUrl: "https://rights-holder.example.test/watch/event",
      }).success,
    ).toBe(true);
  });

  it("enforces protocol/locator invariants and safe absolute HTTP(S) URLs", () => {
    expect(
      streamConfigurationSchema.safeParse({
        ...internalConfiguration,
        protocol: "external",
        externalWatchUrl: null,
      }).success,
    ).toBe(false);
    expect(
      streamConfigurationSchema.safeParse({
        ...internalConfiguration,
        playbackLocator: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      streamConfigurationSchema.safeParse({
        ...internalConfiguration,
        playbackLocator: "https://operator:secret@media.example.test/master.m3u8",
      }).success,
    ).toBe(false);
  });

  it("defaults safe fallback fields when creating a stream", () => {
    const parsed = createAdminStreamSchema.parse({
      eventId: "20000000-0000-4000-8000-000000000001",
      reason: "Add a secondary demo source",
      protocol: "hls",
      playbackLocator: "https://media.example.test/fallback.m3u8",
      provider: "demo-origin",
      providerStreamRef: "event-fallback",
    });
    expect(parsed).toMatchObject({
      state: "provisioning",
      priority: 100,
      externalWatchUrl: null,
      requiresSignedAccess: true,
      dvrWindowSeconds: 0,
      captionsAvailable: false,
    });
  });

  it("requires a reason, optimistic version, and at least one editable patch field", () => {
    const base = {
      reason: "Switch to the healthy origin",
      expectedUpdatedAt: "2026-08-14T12:00:00.000Z",
    };
    expect(updateAdminStreamSchema.safeParse(base).success).toBe(false);
    expect(updateAdminStreamSchema.safeParse({ ...base, state: "live" }).success).toBe(true);
    expect(
      deleteAdminStreamSchema.safeParse({
        reason: "Retire unused demo fallback",
        expectedUpdatedAt: "not-a-timestamp",
      }).success,
    ).toBe(false);
  });

  it("applies explicit null values while retaining omitted fields", () => {
    const patch = updateAdminStreamSchema.parse({
      reason: "Move viewing to the rights holder",
      expectedUpdatedAt: "2026-08-14T12:00:00.000Z",
      protocol: "external",
      playbackLocator: null,
      externalWatchUrl: "https://rights-holder.example.test/event",
    });
    const merged = mergeStreamConfiguration(internalConfiguration, patch);
    expect(merged).toMatchObject({
      protocol: "external",
      playbackLocator: null,
      externalWatchUrl: "https://rights-holder.example.test/event",
      provider: internalConfiguration.provider,
      state: internalConfiguration.state,
    });
    expect(streamConfigurationSchema.safeParse(merged).success).toBe(true);
  });

  it("returns bilingual DTOs and redacts query values and fragments from audits", () => {
    const record = streamRecord();
    expect(toAdminStreamDto(record)).toMatchObject({
      eventTitle: { et: "Näidissündmus", en: "Demo event" },
      updatedAt: "2026-08-14T12:00:00.000Z",
    });
    const snapshot = toAuditSnapshot(record);
    expect(snapshot.playbackLocator).toBe(
      "https://media.example.test/live/master.m3u8?token=%5BREDACTED%5D&policy=%5BREDACTED%5D",
    );
    expect(String(snapshot.playbackLocator)).not.toContain("secret");
    expect(String(snapshot.playbackLocator)).not.toContain("signed-fragment");
    expect(
      toAuditSnapshot(streamRecord({ playbackLocator: "/legacy-demo/unavailable.m3u8" }))
        .playbackLocator,
    ).toBe("[INVALID_URL]");
  });

  it("recognizes wrapped PostgreSQL uniqueness failures", () => {
    expect(isProviderReferenceConflict({ cause: { code: "23505" } })).toBe(true);
    expect(isProviderReferenceConflict({ code: "23514" })).toBe(false);
  });
});
