import { evaluateEntitlement, type EntitlementGrant } from "./evaluate-entitlement";

const now = new Date("2026-08-14T12:00:00Z");
const context = {
  profileId: "profile-1",
  eventId: "event-1",
  competitionId: "competition-1",
  sportId: "sport-1",
  contentType: "live" as const,
  now,
};

function grant(overrides: Partial<EntitlementGrant> = {}): EntitlementGrant {
  return {
    id: "grant-1",
    profileId: null,
    productId: "monthly",
    scope: { kind: "global" },
    validFrom: new Date("2026-08-01T00:00:00Z"),
    validUntil: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

describe("entitlement evaluation", () => {
  it("selects the most specific valid grant", () => {
    const broad = grant({ id: "broad" });
    const event = grant({
      id: "event",
      profileId: "profile-1",
      scope: { kind: "event", eventId: "event-1" },
    });
    expect(evaluateEntitlement([broad, event], context)).toMatchObject({
      allowed: true,
      entitlement: { id: "event" },
    });
  });

  it("treats expiry as an exclusive boundary", () => {
    expect(evaluateEntitlement([grant({ validUntil: now })], context)).toEqual({
      allowed: false,
      reason: "no-matching-entitlement",
    });
  });

  it("rejects revoked, wrong-profile, wrong-content, and wrong-product grants", () => {
    const grants = [
      grant({ id: "revoked", revokedAt: new Date("2026-08-10T00:00:00Z") }),
      grant({ id: "profile", profileId: "someone-else" }),
      grant({ id: "replay", contentTypes: ["replay"] }),
      grant({ id: "product", productId: "event-pass" }),
    ];
    expect(
      evaluateEntitlement(grants, { ...context, acceptedProductIds: ["monthly-plus"] }),
    ).toEqual({ allowed: false, reason: "no-matching-entitlement" });
  });
});
