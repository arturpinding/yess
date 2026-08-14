import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname } from "node:path";
import { mediaProviderActionSchema } from "@/server/media-providers/contracts";
import { LocalMediaController, LocalMediaProviderError } from "./local-controller";

const host = process.env.LOCAL_MEDIA_PROVIDER_HOST ?? "127.0.0.1";
const port = Number(process.env.LOCAL_MEDIA_PROVIDER_PORT ?? "8090");
const publicBaseUrl = process.env.LOCAL_MEDIA_PROVIDER_PUBLIC_URL ?? `http://${host}:${port}`;
const controlToken =
  process.env.MEDIA_PROVIDER_TOKEN ?? "rada-local-media-provider-development-only";
const allowedOrigin = process.env.APP_ORIGIN ?? "http://localhost:3000";

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("LOCAL_MEDIA_PROVIDER_PORT must be a valid TCP port");
}
if (controlToken.length < 32) {
  throw new Error("MEDIA_PROVIDER_TOKEN must contain at least 32 characters");
}

const controller = new LocalMediaController({ publicBaseUrl });

function setCommonHeaders(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", allowedOrigin);
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
}

function json(response: ServerResponse, status: number, value: unknown): void {
  setCommonHeaders(response);
  response.statusCode = status;
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function authorized(request: IncomingMessage): boolean {
  const actual = Buffer.from(request.headers.authorization ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${controlToken}`, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function serveMedia(
  response: ServerResponse,
  reference: string,
  filename: string,
): Promise<void> {
  const path = controller.mediaPath(reference, filename);
  if (!path) {
    json(response, 404, { error: { code: "not_found" } });
    return;
  }
  let details;
  try {
    details = await stat(path);
  } catch {
    json(response, 404, { error: { code: "not_found" } });
    return;
  }
  setCommonHeaders(response);
  response.statusCode = 200;
  response.setHeader("content-length", details.size);
  response.setHeader(
    "content-type",
    extname(filename) === ".m3u8" ? "application/vnd.apple.mpegurl" : "video/mp2t",
  );
  response.setHeader(
    "cache-control",
    extname(filename) === ".m3u8" ? "no-store" : "public, max-age=30, immutable",
  );
  createReadStream(path).pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", publicBaseUrl);
    if (request.method === "OPTIONS") {
      setCommonHeaders(response);
      response.statusCode = 204;
      response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      response.setHeader(
        "access-control-allow-headers",
        "authorization, content-type, idempotency-key",
      );
      response.end();
      return;
    }
    if (request.method === "GET" && url.pathname === "/health") {
      json(response, 200, {
        status: "ok",
        service: "rada-local-media-provider",
        ...controller.summary(),
      });
      return;
    }

    const mediaMatch = /^\/media\/([^/]+)\/([^/]+)$/u.exec(url.pathname);
    if (request.method === "GET" && mediaMatch) {
      await serveMedia(response, decodeURIComponent(mediaMatch[1]!), mediaMatch[2]!);
      return;
    }

    const operationMatch =
      /^\/v1\/streams\/([^/]+)\/(provision|start|publish|unpublish|stop|refresh)$/u.exec(
        url.pathname,
      );
    if (request.method !== "POST" || !operationMatch) {
      json(response, 404, { error: { code: "not_found" } });
      return;
    }
    if (!authorized(request)) {
      json(response, 401, { error: { code: "unauthorized" } });
      return;
    }
    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{8,180}$/u.test(idempotencyKey)) {
      json(response, 400, { error: { code: "invalid_idempotency_key" } });
      return;
    }
    const reference = decodeURIComponent(operationMatch[1]!);
    const action = mediaProviderActionSchema.parse(operationMatch[2]!);
    const result = await controller.execute(reference, action, idempotencyKey);
    json(response, 200, result);
  } catch (error) {
    if (error instanceof LocalMediaProviderError) {
      json(response, error.status, { error: { code: error.code } });
      return;
    }
    json(response, 500, { error: { code: "internal_error" } });
  }
});

server.listen(port, host, () => {
  process.stdout.write(
    `RADA local media provider ready at ${publicBaseUrl} (synthetic HLS only)\n`,
  );
});

async function shutdown(): Promise<void> {
  server.close();
  await controller.shutdown();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
