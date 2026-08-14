import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { privateJson, rateLimitHeaders } from "@/server/http/api-response";
import { createLogger } from "@/server/observability/logger";
import { checkRequestCsrf, consumeApiRateLimit, sha256 } from "@/server/security/request-guards";
import {
  AdminRightsControlError,
  createAdminRightsAuditContext,
  type AdminRightsAuditContext,
} from "./rights-control";

const RIGHTS_ADMIN_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const;
const logger = createLogger({ service: "rada-admin-rights-control" });

export interface AuthorizedAdminRightsRequest {
  requestId: string;
  headers: Record<string, string>;
  audit: AdminRightsAuditContext;
}

export function isAdminRightsControlAvailable(nodeEnvironment = process.env.NODE_ENV): boolean {
  return nodeEnvironment !== "production";
}

export async function authorizeAdminRightsRequest(
  request: NextRequest,
): Promise<
  | { authorized: true; context: AuthorizedAdminRightsRequest }
  | { authorized: false; response: ReturnType<typeof privateJson> }
> {
  const requestId = randomUUID();
  if (!isAdminRightsControlAvailable()) {
    return {
      authorized: false,
      response: privateJson({ error: { code: "not_found" }, requestId }, { status: 404 }),
    };
  }

  const csrf = checkRequestCsrf(request);
  if (!csrf.allowed) {
    return {
      authorized: false,
      response: privateJson({ error: { code: "csrf_failed" }, requestId }, { status: 403 }),
    };
  }

  const rateLimit = await consumeApiRateLimit(
    "admin-rights-control",
    sha256(csrf.token),
    RIGHTS_ADMIN_RATE_LIMIT,
  );
  const headers = rateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return {
      authorized: false,
      response: privateJson(
        { error: { code: "rate_limited" }, requestId },
        { status: 429, headers },
      ),
    };
  }

  return {
    authorized: true,
    context: {
      requestId,
      headers,
      audit: createAdminRightsAuditContext(request, requestId),
    },
  };
}

export function adminRightsErrorResponse(
  error: unknown,
  context: AuthorizedAdminRightsRequest,
): ReturnType<typeof privateJson> {
  if (error instanceof AdminRightsControlError) {
    return privateJson(
      { error: { code: error.code }, requestId: context.requestId },
      { status: error.status, headers: context.headers },
    );
  }
  logger.error({ err: error, requestId: context.requestId }, "Admin rights mutation failed");
  return privateJson(
    { error: { code: "internal_error" }, requestId: context.requestId },
    { status: 500, headers: context.headers },
  );
}
