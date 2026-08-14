import type { EntitlementGrant } from "@/server/entitlements/evaluate-entitlement";
import { resolveRights, type RightsWindow } from "./resolve-rights";

const now = new Date("2026-08-14T12:00:00Z");
const baseContext = {
  profileId: "profile-1",
  eventId: "event-1",
  competitionId: "competition-1",
  sportId: "sport-1",
  contentType: "live" as const,
  countryCode: "EE",
  now,
  entitlements: [] as EntitlementGrant[],
  activePlaybackCount: 0,
};

function rights(overrides: Partial<RightsWindow> = {}): RightsWindow {
  return {
    id: "rights-1",
    scope: { kind: "event", eventId: "event-1" },
    effect: "allow",
    territory: { mode: "include", countryCodes: ["EE"] },
    contentTypes: ["live"],
    validFrom: new Date("2026-08-14T10:00:00Z"),
    validUntil: new Date("2026-08-14T14:00:00Z"),
    priority: 10,
    requiresEntitlement: false,
    delivery: { kind: "internal", streamId: "stream-1" },
    policyVersion: 1,
    ...overrides,
  };
}

describe("rights resolution", () => {
  it("allows an active matching territory and rejects the exact expiry boundary", () => {
    expect(resolveRights([rights()], baseContext)).toMatchObject({
      allowed: true,
      entitlementId: null,
    });
    expect(
      resolveRights([rights()], { ...baseContext, now: new Date("2026-08-14T14:00:00Z") }),
    ).toEqual({ allowed: false, reason: "no-rights" });
  });

  it("fails closed when equally ranked policies disagree", () => {
    const conflicting = rights({
      id: "rights-2",
      delivery: { kind: "external", url: "https://example.test/watch", label: "Watch" },
    });
    expect(resolveRights([rights(), conflicting], baseContext)).toEqual({
      allowed: false,
      reason: "conflicting-rights",
    });
  });

  it("requires the accepted entitlement product", () => {
    const protectedRights = rights({
      requiresEntitlement: true,
      acceptedProductIds: ["monthly"],
    });
    expect(resolveRights([protectedRights], baseContext)).toMatchObject({
      allowed: false,
      reason: "entitlement-required",
    });

    const entitlement: EntitlementGrant = {
      id: "entitlement-1",
      profileId: "profile-1",
      productId: "monthly",
      scope: { kind: "competition", competitionId: "competition-1" },
      validFrom: new Date("2026-08-01T00:00:00Z"),
      validUntil: new Date("2026-09-01T00:00:00Z"),
    };
    expect(
      resolveRights([protectedRights], { ...baseContext, entitlements: [entitlement] }),
    ).toMatchObject({ allowed: true, entitlementId: "entitlement-1" });
  });

  it("enforces internal stream concurrency", () => {
    expect(
      resolveRights([rights({ maxConcurrentStreams: 2 })], {
        ...baseContext,
        activePlaybackCount: 2,
      }),
    ).toMatchObject({ allowed: false, reason: "concurrency-limit" });
  });

  it("prefers an event policy over a broader competition policy", () => {
    const competition = rights({
      id: "competition-rights",
      scope: { kind: "competition", competitionId: "competition-1" },
      priority: 100,
      effect: "deny",
      delivery: { kind: "none" },
    });
    expect(resolveRights([competition, rights()], baseContext)).toMatchObject({
      allowed: true,
      window: { id: "rights-1" },
    });
  });

  it("matches stream policy only for that candidate and ranks it above event policy", () => {
    const streamAllow = rights({
      id: "stream-allow",
      scope: { kind: "stream", streamId: "stream-2" },
      priority: 1,
    });
    const eventDeny = rights({
      id: "event-deny",
      priority: 100,
      effect: "deny",
      delivery: { kind: "none" },
    });

    expect(
      resolveRights([eventDeny, streamAllow], { ...baseContext, streamId: "stream-2" }),
    ).toMatchObject({ allowed: true, window: { id: "stream-allow" } });
    expect(
      resolveRights([eventDeny, streamAllow], { ...baseContext, streamId: "stream-1" }),
    ).toEqual({ allowed: false, reason: "rights-denied", windowId: "event-deny" });
  });

  it("fails closed on equally ranked conflicting stream policies", () => {
    const first = rights({
      id: "stream-a",
      scope: { kind: "stream", streamId: "stream-1" },
      priority: 50,
    });
    const second = rights({
      id: "stream-b",
      scope: { kind: "stream", streamId: "stream-1" },
      priority: 50,
      effect: "deny",
      delivery: { kind: "none" },
    });

    expect(resolveRights([first, second], { ...baseContext, streamId: "stream-1" })).toEqual({
      allowed: false,
      reason: "conflicting-rights",
    });
  });

  it("prefers the higher numeric priority within the same scope", () => {
    const lowerPriorityAllow = rights({ id: "lower-allow", priority: 10 });
    const higherPriorityDeny = rights({
      id: "higher-deny",
      priority: 20,
      effect: "deny",
      delivery: { kind: "none" },
    });

    expect(resolveRights([lowerPriorityAllow, higherPriorityDeny], baseContext)).toEqual({
      allowed: false,
      reason: "rights-denied",
      windowId: "higher-deny",
    });
  });
});
