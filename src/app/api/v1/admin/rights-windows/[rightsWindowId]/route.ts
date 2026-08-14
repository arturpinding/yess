import { type NextRequest } from "next/server";
import { z } from "zod";
import {
  deleteAdminRightsWindow,
  deleteAdminRightsWindowSchema,
  updateAdminRightsWindow,
  updateAdminRightsWindowSchema,
} from "@/server/admin/rights-control";
import {
  adminRightsErrorResponse,
  authorizeAdminRightsRequest,
} from "@/server/admin/rights-request";
import { privateJson } from "@/server/http/api-response";

const paramsSchema = z.object({ rightsWindowId: z.string().uuid() }).strict();
type RightsWindowRouteContext = { params: Promise<{ rightsWindowId: string }> };

async function parseRightsWindowId(routeContext: RightsWindowRouteContext) {
  return paramsSchema.safeParse(await routeContext.params);
}

export async function PATCH(request: NextRequest, routeContext: RightsWindowRouteContext) {
  const authorization = await authorizeAdminRightsRequest(request);
  if (!authorization.authorized) return authorization.response;
  const { context } = authorization;

  const [parsedParams, parsedBody] = await Promise.all([
    parseRightsWindowId(routeContext),
    request
      .json()
      .catch(() => null)
      .then((body) => updateAdminRightsWindowSchema.safeParse(body)),
  ]);
  if (!parsedParams.success || !parsedBody.success) {
    return privateJson(
      {
        error: {
          code: "invalid_request",
          fields: parsedBody.success ? undefined : parsedBody.error.flatten().fieldErrors,
        },
        requestId: context.requestId,
      },
      { status: 400, headers: context.headers },
    );
  }

  try {
    const data = await updateAdminRightsWindow(
      parsedParams.data.rightsWindowId,
      parsedBody.data,
      context.audit,
    );
    return privateJson({ data, requestId: context.requestId }, { headers: context.headers });
  } catch (error) {
    return adminRightsErrorResponse(error, context);
  }
}

export async function DELETE(request: NextRequest, routeContext: RightsWindowRouteContext) {
  const authorization = await authorizeAdminRightsRequest(request);
  if (!authorization.authorized) return authorization.response;
  const { context } = authorization;

  const [parsedParams, parsedBody] = await Promise.all([
    parseRightsWindowId(routeContext),
    request
      .json()
      .catch(() => null)
      .then((body) => deleteAdminRightsWindowSchema.safeParse(body)),
  ]);
  if (!parsedParams.success || !parsedBody.success) {
    return privateJson(
      {
        error: {
          code: "invalid_request",
          fields: parsedBody.success ? undefined : parsedBody.error.flatten().fieldErrors,
        },
        requestId: context.requestId,
      },
      { status: 400, headers: context.headers },
    );
  }

  try {
    const data = await deleteAdminRightsWindow(
      parsedParams.data.rightsWindowId,
      parsedBody.data,
      context.audit,
    );
    return privateJson({ data, requestId: context.requestId }, { headers: context.headers });
  } catch (error) {
    return adminRightsErrorResponse(error, context);
  }
}
