import { NextRequest } from "next/server";
import { z } from "zod";
import {
  deleteAdminStream,
  deleteAdminStreamSchema,
  updateAdminStream,
  updateAdminStreamSchema,
} from "@/server/admin/stream-control";
import {
  adminStreamErrorResponse,
  authorizeAdminStreamRequest,
} from "@/server/admin/stream-request";
import { privateJson } from "@/server/http/api-response";

const paramsSchema = z.object({ streamId: z.string().uuid() }).strict();
type StreamRouteContext = { params: Promise<{ streamId: string }> };

async function parseStreamId(routeContext: StreamRouteContext) {
  return paramsSchema.safeParse(await routeContext.params);
}

export async function PATCH(request: NextRequest, routeContext: StreamRouteContext) {
  const authorization = await authorizeAdminStreamRequest(request);
  if (!authorization.authorized) return authorization.response;
  const { context } = authorization;

  const [parsedParams, parsedBody] = await Promise.all([
    parseStreamId(routeContext),
    request
      .json()
      .catch(() => null)
      .then((body) => updateAdminStreamSchema.safeParse(body)),
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
    const data = await updateAdminStream(
      parsedParams.data.streamId,
      parsedBody.data,
      context.audit,
    );
    return privateJson({ data, requestId: context.requestId }, { headers: context.headers });
  } catch (error) {
    return adminStreamErrorResponse(error, context);
  }
}

export async function DELETE(request: NextRequest, routeContext: StreamRouteContext) {
  const authorization = await authorizeAdminStreamRequest(request);
  if (!authorization.authorized) return authorization.response;
  const { context } = authorization;

  const [parsedParams, parsedBody] = await Promise.all([
    parseStreamId(routeContext),
    request
      .json()
      .catch(() => null)
      .then((body) => deleteAdminStreamSchema.safeParse(body)),
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
    const data = await deleteAdminStream(
      parsedParams.data.streamId,
      parsedBody.data,
      context.audit,
    );
    return privateJson({ data, requestId: context.requestId }, { headers: context.headers });
  } catch (error) {
    return adminStreamErrorResponse(error, context);
  }
}
