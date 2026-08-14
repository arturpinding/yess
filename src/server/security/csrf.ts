import { timingSafeEqual } from "node:crypto";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type AuthenticationMode = "cookie" | "bearer" | "none";

export interface CsrfCheckInput {
  method: string;
  authenticationMode: AuthenticationMode;
  originHeader?: string | null;
  allowedOrigins: readonly string[];
  csrfCookieToken?: string | null;
  csrfHeaderToken?: string | null;
}

export type CsrfFailureReason =
  "missing-origin" | "untrusted-origin" | "missing-token" | "token-mismatch";

export type CsrfCheckResult = { allowed: true } | { allowed: false; reason: CsrfFailureReason };

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
}

/**
 * Cookie-authenticated unsafe requests require both an exact Origin match and
 * a double-submit token. Bearer credentials are not ambient browser authority,
 * so correctly authenticated bearer requests are not vulnerable to CSRF.
 */
export function checkCsrfProtection(input: CsrfCheckInput): CsrfCheckResult {
  if (SAFE_METHODS.has(input.method.toUpperCase()) || input.authenticationMode === "bearer") {
    return { allowed: true };
  }

  if (!input.originHeader) {
    return { allowed: false, reason: "missing-origin" };
  }

  const requestOrigin = normalizeOrigin(input.originHeader);
  const allowedOrigins = new Set(
    input.allowedOrigins.map(normalizeOrigin).filter((origin): origin is string => origin !== null),
  );
  if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
    return { allowed: false, reason: "untrusted-origin" };
  }

  if (!input.csrfCookieToken || !input.csrfHeaderToken) {
    return { allowed: false, reason: "missing-token" };
  }

  if (!constantTimeEqual(input.csrfCookieToken, input.csrfHeaderToken)) {
    return { allowed: false, reason: "token-mismatch" };
  }

  return { allowed: true };
}

export class CsrfProtectionError extends Error {
  readonly reason: CsrfFailureReason;

  constructor(reason: CsrfFailureReason) {
    super("Request failed CSRF validation");
    this.name = "CsrfProtectionError";
    this.reason = reason;
  }
}

export function assertCsrfProtection(input: CsrfCheckInput): void {
  const result = checkCsrfProtection(input);
  if (!result.allowed) {
    throw new CsrfProtectionError(result.reason);
  }
}
