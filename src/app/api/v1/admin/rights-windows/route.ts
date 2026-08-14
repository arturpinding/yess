import { type NextRequest } from "next/server";
import {
  createAdminRightsWindow,
  createAdminRightsWindowSchema,
} from "@/server/admin/rights-control";
import {
  adminRightsErrorResponse,
  authorizeAdminRightsRequest,
} from "@/server/admin/rights-request";
import { privateJson } from "@/server/http/api-response";

export async function POST(request: NextRequest) {
  const authorization = await authorizeAdminRightsRequest(request);
  if (!authorization.authorized) return authorization.response;
  const { context } = authorization;

  const parsed = createAdminRightsWindowSchema.safeParse(await request.json().catch(() => null));
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
    const data = await createAdminRightsWindow(parsed.data, context.audit);
    return privateJson(
      { data, requestId: context.requestId },
      { status: 201, headers: context.headers },
    );
  } catch (error) {
    return adminRightsErrorResponse(error, context);
  }
}
