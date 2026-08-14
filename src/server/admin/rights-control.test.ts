import type { RightsWindow } from "@/server/db/schema";
import {
  AdminRightsControlError,
  assertRightsWindowDeletable,
  createAdminRightsWindowSchema,
  deleteAdminRightsWindowSchema,
  mergeRightsWindowConfiguration,
  nextRightsUpdatedAt,
  rightsConfigurationFromCreateInput,
  rightsWindowConfigurationSchema,
  toAdminRightsWindowDto,
  toRightsAuditSnapshot,
  updateAdminRightsWindowSchema,
  type AdminRightsRecord,
  type RightsWindowConfiguration,
} from "./rights-control";

const eventId = "20000000-0000-4000-8000-000000000001";
const rightsId = "30000000-0000-4000-8000-000000000001";
const productId = "40000000-0000-4000-8000-000000000001";

const configuration: RightsWindowConfiguration = {
  target: { type: "event", id: eventId },
  contentKind: "live",
  countryCode: "EE",
  access: "entitled",
  requiredProductId: productId,
  startsAt: "2026-08-14T12:00:00.000Z",
  endsAt: "2026-08-14T16:00:00.000Z",
  dvrAllowed: true,
  recordingAllowed: true,
  maxConcurrentStreams: 2,
  externalWatchUrl: null,
  rightsHolder: "Demo rights holder",
  contractReference: "DEMO-2026-001",
  priority: 200,
};

function record(overrides: Partial<RightsWindow> = {}): AdminRightsRecord {
  const timestamp = new Date("2026-08-14T12:00:00.000Z");
  return {
    row: {
      id: rightsId,
      competitionId: null,
      eventId,
      streamId: null,
      mediaAssetId: null,
      contentKind: "live",
      countryCode: "EE",
      access: "external_only",
      requiredProductId: null,
      startsAt: timestamp,
      endsAt: new Date("2026-08-14T16:00:00.000Z"),
      dvrAllowed: false,
      recordingAllowed: false,
      maxConcurrentStreams: null,
      externalWatchUrl:
        "https://watch.example.test/event?token=secret&contract=private#signed-fragment",
      rightsHolder: "Demo rights holder",
      contractReference: "DEMO-2026-001",
      priority: 200,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...overrides,
    },
    target: {
      type: "event",
      id: eventId,
      label: { et: "Näidissündmus", en: "Demo event" },
      eventId,
    },
  };
}

describe("admin rights-control contract", () => {
  it("normalizes territories and applies safe creation defaults", () => {
    const parsed = createAdminRightsWindowSchema.parse({
      target: configuration.target,
      contentKind: "live",
      countryCode: "ee",
      access: "free",
      startsAt: configuration.startsAt,
      endsAt: configuration.endsAt,
      rightsHolder: configuration.rightsHolder,
      reason: "Publish the Estonian demo window",
    });
    expect(parsed).toMatchObject({
      countryCode: "EE",
      requiredProductId: null,
      dvrAllowed: false,
      recordingAllowed: false,
      maxConcurrentStreams: null,
      externalWatchUrl: null,
      contractReference: null,
      priority: 100,
    });
    expect(rightsConfigurationFromCreateInput(parsed)).not.toHaveProperty("reason");
  });

  it("enforces access, dates, DVR, and safe external destination invariants", () => {
    expect(
      rightsWindowConfigurationSchema.safeParse({ ...configuration, requiredProductId: null })
        .success,
    ).toBe(false);
    expect(
      rightsWindowConfigurationSchema.safeParse({
        ...configuration,
        access: "external_only",
        requiredProductId: null,
        externalWatchUrl: "javascript:alert(1)",
        maxConcurrentStreams: null,
      }).success,
    ).toBe(false);
    expect(
      rightsWindowConfigurationSchema.safeParse({
        ...configuration,
        access: "external_only",
        requiredProductId: null,
        externalWatchUrl: "https://operator:secret@watch.example.test/event",
        maxConcurrentStreams: null,
      }).success,
    ).toBe(false);
    expect(
      rightsWindowConfigurationSchema.safeParse({
        ...configuration,
        contentKind: "replay",
        dvrAllowed: true,
      }).success,
    ).toBe(false);
    expect(
      rightsWindowConfigurationSchema.safeParse({
        ...configuration,
        endsAt: configuration.startsAt,
      }).success,
    ).toBe(false);
  });

  it("turns an access-only unavailable patch into an atomic emergency takedown", () => {
    const patch = updateAdminRightsWindowSchema.parse({
      reason: "Emergency legal takedown",
      expectedUpdatedAt: "2026-08-14T12:00:00.000Z",
      access: "unavailable",
    });
    expect(mergeRightsWindowConfiguration(configuration, patch)).toMatchObject({
      access: "unavailable",
      requiredProductId: null,
      externalWatchUrl: null,
      maxConcurrentStreams: null,
      dvrAllowed: false,
      recordingAllowed: false,
    });
  });

  it("requires a reason, optimistic version, and an actual patch", () => {
    const version = {
      reason: "Correct contract metadata",
      expectedUpdatedAt: "2026-08-14T12:00:00.000Z",
    };
    expect(updateAdminRightsWindowSchema.safeParse(version).success).toBe(false);
    expect(
      updateAdminRightsWindowSchema.safeParse({ ...version, contractReference: null }).success,
    ).toBe(true);
    expect(
      deleteAdminRightsWindowSchema.safeParse({ ...version, expectedUpdatedAt: "yesterday" })
        .success,
    ).toBe(false);
  });

  it("always advances the optimistic timestamp", () => {
    const previous = new Date("2026-08-14T12:00:00.123Z");
    expect(nextRightsUpdatedAt(previous, new Date("2026-08-14T12:00:00.123Z")).toISOString()).toBe(
      "2026-08-14T12:00:00.124Z",
    );
    expect(nextRightsUpdatedAt(previous, new Date("2026-08-14T12:00:01.000Z")).toISOString()).toBe(
      "2026-08-14T12:00:01.000Z",
    );
  });

  it("deletes only inactive policies attached to demo targets", () => {
    const now = new Date("2026-08-14T13:00:00.000Z");
    expect(() =>
      assertRightsWindowDeletable(
        {
          startsAt: new Date("2026-08-14T12:00:00.000Z"),
          endsAt: new Date("2026-08-14T14:00:00.000Z"),
        },
        true,
        now,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<AdminRightsControlError>>({
        code: "active_rights_window",
        status: 409,
      }),
    );
    expect(() =>
      assertRightsWindowDeletable(
        {
          startsAt: new Date("2026-08-15T12:00:00.000Z"),
          endsAt: new Date("2026-08-15T14:00:00.000Z"),
        },
        false,
        now,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<AdminRightsControlError>>({
        code: "demo_target_required",
        status: 403,
      }),
    );
    expect(() =>
      assertRightsWindowDeletable(
        {
          startsAt: new Date("2026-08-15T12:00:00.000Z"),
          endsAt: new Date("2026-08-15T14:00:00.000Z"),
        },
        true,
        now,
      ),
    ).not.toThrow();
  });

  it("serializes exact targets and redacts legal-viewing URL secrets in audit history", () => {
    expect(toAdminRightsWindowDto(record())).toMatchObject({
      id: rightsId,
      target: { type: "event", id: eventId, label: { en: "Demo event" } },
      startsAt: "2026-08-14T12:00:00.000Z",
      updatedAt: "2026-08-14T12:00:00.000Z",
    });
    const audit = toRightsAuditSnapshot(record());
    expect(audit.externalWatchUrl).toBe(
      "https://watch.example.test/event?token=%5BREDACTED%5D&contract=%5BREDACTED%5D",
    );
    expect(String(audit.externalWatchUrl)).not.toContain("secret");
    expect(String(audit.externalWatchUrl)).not.toContain("signed-fragment");
  });
});
