import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { privateJson, rateLimitHeaders } from "@/server/http/api-response";
import { createLogger } from "@/server/observability/logger";
import { checkRequestCsrf, consumeApiRateLimit, sha256 } from "@/server/security/request-guards";
import {
  AdminStreamControlError,
  createAdminAuditContext,
  isProviderReferenceConflict,
  type AdminAuditContext,
} from "./stream-control";

const STREAM_ADMIN_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;
const logger = createLogger({ service: "rada-admin-stream-control" });

export interface AuthorizedAdminStreamRequest {
  requestId: string;
  headers: Record<string, string>;
  audit: AdminAuditContext;
}

export function isAdminStreamControlAvailable(nodeEnvironment = process.env.NODE_ENV): boolean {
  return nodeEnvironment !== "production";
}

export async function authorizeAdminStreamRequest(
  request: NextRequest,
): Promise<
  | { authorized: true; context: AuthorizedAdminStreamRequest }
  | { authorized: false; response: ReturnType<typeof privateJson> }
> {
  const requestId = randomUUID();
  if (!isAdminStreamControlAvailable()) {
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

  const decision = await consumeApiRateLimit(
    "admin-stream-control",
    sha256(csrf.token),
    STREAM_ADMIN_RATE_LIMIT,
  );
  const headers = rateLimitHeaders(decision);
  if (!decision.allowed) {
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
      audit: createAdminAuditContext(request, requestId),
    },
  };
}

export function adminStreamErrorResponse(
  error: unknown,
  context: AuthorizedAdminStreamRequest,
): ReturnType<typeof privateJson> {
  if (error instanceof AdminStreamControlError) {
    return privateJson(
      { error: { code: error.code }, requestId: context.requestId },
      { status: error.status, headers: context.headers },
    );
  }
  if (isProviderReferenceConflict(error)) {
    return privateJson(
      { error: { code: "provider_reference_conflict" }, requestId: context.requestId },
      { status: 409, headers: context.headers },
    );
  }

  logger.error({ err: error, requestId: context.requestId }, "Admin stream mutation failed");
  return privateJson(
    { error: { code: "internal_error" }, requestId: context.requestId },
    { status: 500, headers: context.headers },
  );
}
