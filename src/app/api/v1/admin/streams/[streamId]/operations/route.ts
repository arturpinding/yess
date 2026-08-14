import { NextRequest } from "next/server";
import { z } from "zod";
import {
  adminMediaOperationSchema,
  idempotencyKeySchema,
  operateAdminStream,
} from "@/server/admin/media-operation";
import {
  adminStreamErrorResponse,
  authorizeAdminStreamRequest,
} from "@/server/admin/stream-request";
import { privateJson } from "@/server/http/api-response";

const paramsSchema = z.object({ streamId: z.string().uuid() }).strict();
type RouteContext = { params: Promise<{ streamId: string }> };

export async function POST(request: NextRequest, routeContext: RouteContext) {
  const authorization = await authorizeAdminStreamRequest(request);
  if (!authorization.authorized) return authorization.response;
  const { context } = authorization;

  const [parsedParams, parsedBody, parsedIdempotencyKey] = await Promise.all([
    routeContext.params.then((params) => paramsSchema.safeParse(params)),
    request
      .json()
      .catch(() => null)
      .then((body) => adminMediaOperationSchema.safeParse(body)),
    Promise.resolve(idempotencyKeySchema.safeParse(request.headers.get("idempotency-key"))),
  ]);
  if (!parsedParams.success || !parsedBody.success || !parsedIdempotencyKey.success) {
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
    const data = await operateAdminStream(
      parsedParams.data.streamId,
      parsedBody.data,
      parsedIdempotencyKey.data,
      context.audit,
    );
    return privateJson({ data, requestId: context.requestId }, { headers: context.headers });
  } catch (error) {
    return adminStreamErrorResponse(error, context);
  }
}
