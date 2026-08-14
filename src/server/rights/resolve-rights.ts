import type { ContentType, EventContentContext } from "@/domain/content";
import {
  evaluateEntitlement,
  type EntitlementGrant,
} from "@/server/entitlements/evaluate-entitlement";
import { compareRightsPriorityDescending } from "@/server/rights/priority";

export type RightsScope =
  | { kind: "global" }
  | { kind: "competition"; competitionId: string }
  | { kind: "event"; eventId: string }
  | { kind: "stream"; streamId: string };

export interface RightsTerritory {
  /** `include` applies only inside the list; `exclude` applies everywhere outside it. */
  mode: "include" | "exclude";
  countryCodes: readonly string[];
}

export type RightsDelivery =
  | { kind: "internal"; streamId: string }
  | { kind: "external"; url: string; label: string }
  | { kind: "none" };

export interface RightsWindow {
  id: string;
  scope: RightsScope;
  effect: "allow" | "deny";
  territory: RightsTerritory;
  contentTypes: readonly ContentType[];
  validFrom: Date;
  validUntil: Date;
  priority: number;
  requiresEntitlement: boolean;
  acceptedProductIds?: readonly string[];
  maxConcurrentStreams?: number;
  delivery: RightsDelivery;
  policyVersion: number;
}

export interface RightsResolutionContext extends EventContentContext {
  /** Present when resolving policy for one concrete playback candidate. */
  streamId?: string;
  profileId: string;
  countryCode: string;
  now: Date;
  entitlements: readonly EntitlementGrant[];
  /** Must come from an atomic lease store at the integration boundary. */
  activePlaybackCount: number;
}

export type RightsDenialReason =
  | "no-rights"
  | "conflicting-rights"
  | "rights-denied"
  | "entitlement-required"
  | "concurrency-limit";

export type RightsResolution =
  | {
      allowed: true;
      window: RightsWindow;
      delivery: RightsDelivery;
      entitlementId: string | null;
    }
  | {
      allowed: false;
      reason: RightsDenialReason;
      windowId?: string;
    };

function scopeMatches(
  scope: RightsScope,
  context: EventContentContext & { streamId?: string },
): boolean {
  switch (scope.kind) {
    case "global":
      return true;
    case "competition":
      return scope.competitionId === context.competitionId;
    case "event":
      return scope.eventId === context.eventId;
    case "stream":
      return scope.streamId === context.streamId;
  }
}

function scopeSpecificity(scope: RightsScope): number {
  switch (scope.kind) {
    case "stream":
      return 4;
    case "event":
      return 3;
    case "competition":
      return 2;
    case "global":
      return 1;
  }
}

function territoryMatches(territory: RightsTerritory, countryCode: string): boolean {
  const codes = new Set(territory.countryCodes.map((code) => code.toUpperCase()));
  return territory.mode === "include" ? codes.has(countryCode) : !codes.has(countryCode);
}

function policyFingerprint(window: RightsWindow): string {
  const acceptedProductIds = [...(window.acceptedProductIds ?? [])].sort();
  return JSON.stringify({
    effect: window.effect,
    delivery: window.delivery,
    requiresEntitlement: window.requiresEntitlement,
    acceptedProductIds,
    maxConcurrentStreams: window.maxConcurrentStreams ?? null,
    policyVersion: window.policyVersion,
  });
}

function isStructurallyValid(window: RightsWindow): boolean {
  const startsAt = window.validFrom.getTime();
  const endsAt = window.validUntil.getTime();
  return (
    Number.isFinite(startsAt) &&
    Number.isFinite(endsAt) &&
    startsAt < endsAt &&
    Number.isInteger(window.priority) &&
    Number.isInteger(window.policyVersion) &&
    window.policyVersion >= 0 &&
    (window.maxConcurrentStreams === undefined ||
      (Number.isInteger(window.maxConcurrentStreams) && window.maxConcurrentStreams >= 1))
  );
}

/**
 * Resolves the most specific active policy and fails closed when equally ranked
 * windows disagree. Window ends are exclusive, preventing access at expiry.
 */
export function resolveRights(
  windows: readonly RightsWindow[],
  context: RightsResolutionContext,
): RightsResolution {
  const countryCode = context.countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new RangeError("countryCode must be an ISO 3166-1 alpha-2 code");
  }
  if (!Number.isInteger(context.activePlaybackCount) || context.activePlaybackCount < 0) {
    throw new RangeError("activePlaybackCount must be a non-negative integer");
  }
  const nowMs = context.now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new RangeError("Rights resolution requires a valid current instant");
  }

  const candidates = windows.filter(
    (window) =>
      isStructurallyValid(window) &&
      scopeMatches(window.scope, context) &&
      window.contentTypes.includes(context.contentType) &&
      window.validFrom.getTime() <= nowMs &&
      nowMs < window.validUntil.getTime() &&
      territoryMatches(window.territory, countryCode),
  );

  if (candidates.length === 0) {
    return { allowed: false, reason: "no-rights" };
  }

  candidates.sort((left, right) => {
    const specificity = scopeSpecificity(right.scope) - scopeSpecificity(left.scope);
    if (specificity !== 0) return specificity;
    const priority = compareRightsPriorityDescending(left, right);
    if (priority !== 0) return priority;
    return left.id.localeCompare(right.id);
  });

  const first = candidates[0];
  if (!first) {
    return { allowed: false, reason: "no-rights" };
  }
  const winningSpecificity = scopeSpecificity(first.scope);
  const equallyRanked = candidates.filter(
    (window) =>
      scopeSpecificity(window.scope) === winningSpecificity && window.priority === first.priority,
  );
  if (new Set(equallyRanked.map(policyFingerprint)).size > 1) {
    return { allowed: false, reason: "conflicting-rights" };
  }

  if (first.effect === "deny") {
    return { allowed: false, reason: "rights-denied", windowId: first.id };
  }

  let entitlementId: string | null = null;
  if (first.requiresEntitlement) {
    const entitlement = evaluateEntitlement(context.entitlements, {
      profileId: context.profileId,
      eventId: context.eventId,
      competitionId: context.competitionId,
      sportId: context.sportId,
      contentType: context.contentType,
      now: context.now,
      acceptedProductIds: first.acceptedProductIds,
    });
    if (!entitlement.allowed) {
      return { allowed: false, reason: "entitlement-required", windowId: first.id };
    }
    entitlementId = entitlement.entitlement.id;
  }

  if (
    first.delivery.kind === "internal" &&
    first.maxConcurrentStreams !== undefined &&
    context.activePlaybackCount >= first.maxConcurrentStreams
  ) {
    return { allowed: false, reason: "concurrency-limit", windowId: first.id };
  }

  return {
    allowed: true,
    window: first,
    delivery: first.delivery,
    entitlementId,
  };
}
