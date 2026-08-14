import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearEnvironmentCacheForTests } from "@/server/environment";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  submitOffer: vi.fn(),
  claimViewer: vi.fn(),
  submitAnswer: vi.fn(),
  getAnswer: vi.fn(),
  delete: vi.fn(),
  consumeRateLimit: vi.fn(),
}));

vi.mock("@/server/demo-broadcast/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/demo-broadcast/service")>();
  return {
    ...actual,
    demoBroadcastService: {
      create: mocks.create,
      submitOffer: mocks.submitOffer,
      claimViewer: mocks.claimViewer,
      submitAnswer: mocks.submitAnswer,
      getAnswer: mocks.getAnswer,
      delete: mocks.delete,
    },
  };
});

vi.mock("@/server/security/request-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/security/request-guards")>();
  return { ...actual, consumeApiRateLimit: mocks.consumeRateLimit };
});

import { DELETE } from "./[code]/route";
import { GET as GET_ANSWER, POST as POST_ANSWER } from "./[code]/answer/route";
import { POST as POST_OFFER } from "./[code]/offer/route";
import { POST as POST_VIEWER } from "./[code]/viewer/route";
import { POST as POST_CREATE } from "./route";
import { DemoBroadcastError } from "@/server/demo-broadcast/service";

const code = "0123-WXYZ";
const publisherToken = Buffer.alloc(32, 1).toString("base64url");
const viewerToken = Buffer.alloc(32, 2).toString("base64url");
const csrfToken = "demo-broadcast-route-csrf-token";
const expiresAt = "2026-08-14T12:30:00.000Z";
const offerSdp = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=offer\r\nt=0 0\r\n";
const answerSdp = "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=answer\r\nt=0 0\r\n";

function request(
  method: string,
  path: string,
  body?: unknown,
  options: { csrf?: boolean; authorization?: string } = {},
) {
  const headers = new Headers({
    origin: "http://localhost:3000",
    "x-real-ip": "192.0.2.10",
  });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (options.csrf) {
    headers.set("cookie", `rada-csrf=${csrfToken}`);
    headers.set("x-csrf-token", csrfToken);
  }
  if (options.authorization) headers.set("authorization", options.authorization);
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function context() {
  return { params: Promise.resolve({ code }) };
}

describe("development demo broadcast signaling routes", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
    vi.stubEnv("DATABASE_URL", "postgres://rada:rada@localhost:5432/rada_test");
    vi.stubEnv("SESSION_SECRET", "session-secret-that-is-at-least-32-characters");
    vi.stubEnv("MEDIA_SIGNING_SECRET", "media-secret-that-is-at-least-32-characters");
    vi.stubEnv("DEFAULT_COUNTRY", "EE");
    clearEnvironmentCacheForTests();
    vi.clearAllMocks();
    mocks.consumeRateLimit.mockResolvedValue({
      allowed: true,
      limit: 180,
      remaining: 179,
      retryAfterMs: 0,
      resetAt: new Date("2026-08-14T12:01:00.000Z"),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearEnvironmentCacheForTests();
  });

  it("creates a private 30-minute room after same-origin double-submit CSRF", async () => {
    mocks.create.mockResolvedValue({ code, publisherToken, expiresAt });
    const response = await POST_CREATE(
      request("POST", "/api/v1/demo-broadcasts", { locale: "et" }, { csrf: true }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    await expect(response.json()).resolves.toEqual({
      data: { code, publisherToken, expiresAt },
    });
    expect(mocks.create).toHaveBeenCalledWith("et");
  });

  it("rejects create and viewer claims without same-origin double-submit CSRF", async () => {
    const createResponse = await POST_CREATE(
      request("POST", "/api/v1/demo-broadcasts", { locale: "en" }),
    );
    const viewerResponse = await POST_VIEWER(
      request("POST", `/api/v1/demo-broadcasts/${code}/viewer`, {}),
      context(),
    );

    expect(createResponse.status).toBe(403);
    expect(viewerResponse.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.claimViewer).not.toHaveBeenCalled();
  });

  it("requires a strict publisher bearer token and validates bounded SDP before service access", async () => {
    const malformedBearer = await POST_OFFER(
      request(
        "POST",
        `/api/v1/demo-broadcasts/${code}/offer`,
        { type: "offer", sdp: offerSdp },
        { authorization: `bearer ${publisherToken}` },
      ),
      context(),
    );
    expect(malformedBearer.status).toBe(401);

    const invalidSdp = await POST_OFFER(
      request(
        "POST",
        `/api/v1/demo-broadcasts/${code}/offer`,
        { type: "offer", sdp: "not-sdp" },
        { authorization: `Bearer ${publisherToken}` },
      ),
      context(),
    );
    expect(invalidSdp.status).toBe(400);
    expect(mocks.submitOffer).not.toHaveBeenCalled();

    mocks.submitOffer.mockRejectedValueOnce(new DemoBroadcastError("invalid_publisher_token", 401));
    const wrongToken = await POST_OFFER(
      request(
        "POST",
        `/api/v1/demo-broadcasts/${code}/offer`,
        { type: "offer", sdp: offerSdp },
        { authorization: `Bearer ${publisherToken}` },
      ),
      context(),
    );
    expect(wrongToken.status).toBe(401);
    await expect(wrongToken.json()).resolves.toEqual({
      error: { code: "invalid_publisher_token" },
    });
  });

  it("returns private SDP-bearing viewer, answer submission, and publisher poll responses", async () => {
    mocks.claimViewer.mockResolvedValue({
      viewerToken,
      offer: { type: "offer", sdp: offerSdp },
      expiresAt,
    });
    const viewerResponse = await POST_VIEWER(
      request("POST", `/api/v1/demo-broadcasts/${code}/viewer`, {}, { csrf: true }),
      context(),
    );
    expect(viewerResponse.status).toBe(201);
    expect(viewerResponse.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    await expect(viewerResponse.json()).resolves.toMatchObject({
      data: { viewerToken, offer: { type: "offer", sdp: offerSdp } },
    });

    mocks.submitAnswer.mockResolvedValue({ accepted: true, state: "connected", expiresAt });
    const answerResponse = await POST_ANSWER(
      request(
        "POST",
        `/api/v1/demo-broadcasts/${code}/answer`,
        { type: "answer", sdp: answerSdp },
        { authorization: `Bearer ${viewerToken}` },
      ),
      context(),
    );
    expect(answerResponse.status).toBe(200);
    expect(mocks.submitAnswer).toHaveBeenCalledWith(code, viewerToken, {
      type: "answer",
      sdp: answerSdp,
    });

    mocks.getAnswer.mockResolvedValue({
      answer: { type: "answer", sdp: answerSdp },
      state: "connected",
      expiresAt,
    });
    const pollResponse = await GET_ANSWER(
      request("GET", `/api/v1/demo-broadcasts/${code}/answer`, undefined, {
        authorization: `Bearer ${publisherToken}`,
      }),
      context(),
    );
    expect(pollResponse.status).toBe(200);
    expect(pollResponse.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    await expect(pollResponse.json()).resolves.toMatchObject({
      data: { answer: { type: "answer", sdp: answerSdp }, state: "connected" },
    });
  });

  it("deletes a room with the publisher credential", async () => {
    mocks.delete.mockResolvedValue({ deleted: true });
    const response = await DELETE(
      request("DELETE", `/api/v1/demo-broadcasts/${code}`, undefined, {
        authorization: `Bearer ${publisherToken}`,
      }),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { deleted: true } });
    expect(mocks.delete).toHaveBeenCalledWith(code, publisherToken);
  });

  it("hard-404s every signaling route in production before auth, parsing, or service access", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const responses = await Promise.all([
      POST_CREATE(request("POST", "/api/v1/demo-broadcasts", { not: "valid" })),
      POST_OFFER(
        request("POST", `/api/v1/demo-broadcasts/${code}/offer`, { not: "valid" }),
        context(),
      ),
      POST_VIEWER(
        request("POST", `/api/v1/demo-broadcasts/${code}/viewer`, { not: "valid" }),
        context(),
      ),
      POST_ANSWER(
        request("POST", `/api/v1/demo-broadcasts/${code}/answer`, { not: "valid" }),
        context(),
      ),
      GET_ANSWER(request("GET", `/api/v1/demo-broadcasts/${code}/answer`), context()),
      DELETE(request("DELETE", `/api/v1/demo-broadcasts/${code}`), context()),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404, 404]);
    expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.submitOffer).not.toHaveBeenCalled();
    expect(mocks.claimViewer).not.toHaveBeenCalled();
    expect(mocks.submitAnswer).not.toHaveBeenCalled();
    expect(mocks.getAnswer).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
