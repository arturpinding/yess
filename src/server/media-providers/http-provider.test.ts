import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaProviderError } from "./contracts";
import { HttpMediaProvider } from "./http-provider";

const request = {
  providerKey: "local-ffmpeg",
  providerResourceId: "demo-source",
  action: "provision" as const,
  idempotencyKey: "admin-operation-0001",
};

afterEach(() => vi.unstubAllEnvs());

describe("HTTP media provider adapter", () => {
  it("uses the allow-listed endpoint, bearer token and idempotency key", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          providerRequestId: "provider-request-1",
          providerKey: "local-ffmpeg",
          providerResourceId: "demo-source",
          observedState: "provisioned",
          published: false,
          playbackLocator: "http://127.0.0.1:8090/media/demo-source/index.m3u8",
          healthy: true,
          occurredAt: "2026-08-14T12:00:00.000Z",
        }),
        { status: 200 },
      ),
    );
    const provider = new HttpMediaProvider({
      baseUrl: "http://127.0.0.1:8090",
      token: "provider-token-that-is-at-least-thirty-two-characters",
      fetcher,
    });

    await expect(provider.execute(request)).resolves.toMatchObject({
      observedState: "provisioned",
      healthy: true,
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:8090/v1/streams/demo-source/provision"),
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        headers: expect.objectContaining({
          authorization: "Bearer provider-token-that-is-at-least-thirty-two-characters",
          "idempotency-key": "admin-operation-0001",
        }),
      }),
    );
  });

  it("rejects arbitrary development egress destinations", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(
      () =>
        new HttpMediaProvider({
          baseUrl: "http://169.254.169.254/latest/meta-data",
          token: "provider-token-that-is-at-least-thirty-two-characters",
        }),
    ).toThrowError(new MediaProviderError("provider_configuration_invalid", 500));
  });

  it("maps provider failures to a safe stable error without exposing its payload", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const provider = new HttpMediaProvider({
      baseUrl: "http://localhost:8090",
      token: "provider-token-that-is-at-least-thirty-two-characters",
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "must_unpublish_first", secret: "no" } }), {
          status: 409,
        }),
      ),
    });
    await expect(provider.execute(request)).rejects.toMatchObject({
      code: "must_unpublish_first",
      status: 409,
    });
  });
});
