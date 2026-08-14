import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("locale and production route proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks the demo control room at the request boundary in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = proxy(new NextRequest("https://rada.invalid/en/admin"));

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    await expect(response.text()).resolves.toBe("Not found");
  });

  it("keeps localized public routes available outside production", () => {
    vi.stubEnv("NODE_ENV", "test");

    const response = proxy(new NextRequest("https://rada.invalid/en"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-request-x-rada-locale")).toBe("en");
  });
});
