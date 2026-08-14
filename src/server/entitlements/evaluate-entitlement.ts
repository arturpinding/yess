import type { ContentType, EventContentContext } from "@/domain/content";

export type EntitlementScope =
  | { kind: "global" }
  | { kind: "sport"; sportId: string }
  | { kind: "competition"; competitionId: string }
  | { kind: "event"; eventId: string };

export interface EntitlementGrant {
  id: string;
  /** Null means the account grant applies to every profile on the account. */
  profileId: string | null;
  productId: string;
  scope: EntitlementScope;
  contentTypes?: readonly ContentType[];
  validFrom: Date;
  validUntil: Date | null;
  revokedAt?: Date | null;
}

export interface EntitlementEvaluationContext extends EventContentContext {
  profileId: string;
  now: Date;
  acceptedProductIds?: readonly string[];
}

export type EntitlementEvaluation =
  | { allowed: true; entitlement: EntitlementGrant }
  | { allowed: false; reason: "no-matching-entitlement" };

function scopeMatches(scope: EntitlementScope, context: EventContentContext): boolean {
  switch (scope.kind) {
    case "global":
      return true;
    case "sport":
      return scope.sportId === context.sportId;
    case "competition":
      return scope.competitionId === context.competitionId;
    case "event":
      return scope.eventId === context.eventId;
  }
}

function scopeSpecificity(scope: EntitlementScope): number {
  switch (scope.kind) {
    case "event":
      return 4;
    case "competition":
      return 3;
    case "sport":
      return 2;
    case "global":
      return 1;
  }
}

function isActive(grant: EntitlementGrant, nowMs: number): boolean {
  const startsAt = grant.validFrom.getTime();
  const endsAt = grant.validUntil?.getTime() ?? Number.POSITIVE_INFINITY;
  const revokedAt = grant.revokedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return (
    Number.isFinite(startsAt) &&
    startsAt <= nowMs &&
    nowMs < endsAt &&
    nowMs < revokedAt &&
    endsAt > startsAt
  );
}

/** Entitlement validity uses a half-open interval: validFrom <= now < validUntil. */
export function evaluateEntitlement(
  grants: readonly EntitlementGrant[],
  context: EntitlementEvaluationContext,
): EntitlementEvaluation {
  const nowMs = context.now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new RangeError("Entitlement evaluation requires a valid current instant");
  }

  const acceptedProducts = context.acceptedProductIds ? new Set(context.acceptedProductIds) : null;

  const matches = grants.filter(
    (grant) =>
      (grant.profileId === null || grant.profileId === context.profileId) &&
      isActive(grant, nowMs) &&
      scopeMatches(grant.scope, context) &&
      (!grant.contentTypes || grant.contentTypes.includes(context.contentType)) &&
      (!acceptedProducts || acceptedProducts.size === 0 || acceptedProducts.has(grant.productId)),
  );

  matches.sort((left, right) => {
    const specificity = scopeSpecificity(right.scope) - scopeSpecificity(left.scope);
    if (specificity !== 0) return specificity;
    const profileSpecific = Number(right.profileId !== null) - Number(left.profileId !== null);
    if (profileSpecific !== 0) return profileSpecific;
    return left.id.localeCompare(right.id);
  });

  const entitlement = matches[0];
  return entitlement
    ? { allowed: true, entitlement }
    : { allowed: false, reason: "no-matching-entitlement" };
}
