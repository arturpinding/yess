import { NextRequest } from "next/server";
import { createAdminStream, createAdminStreamSchema } from "@/server/admin/stream-control";
import {
  adminStreamErrorResponse,
  authorizeAdminStreamRequest,
} from "@/server/admin/stream-request";
import { privateJson } from "@/server/http/api-response";

export async function POST(request: NextRequest) {
  const authorization = await authorizeAdminStreamRequest(request);
  if (!authorization.authorized) return authorization.response;
  const { context } = authorization;

  const parsed = createAdminStreamSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return privateJson(
      {
        error: { code: "invalid_request", fields: parsed.error.flatten().fieldErrors },
        requestId: context.requestId,
      },
      { status: 400, headers: context.headers },
    );
  }

  try {
    const data = await createAdminStream(parsed.data, context.audit);
    return privateJson(
      { data, requestId: context.requestId },
      { status: 201, headers: context.headers },
    );
  } catch (error) {
    return adminStreamErrorResponse(error, context);
  }
}
