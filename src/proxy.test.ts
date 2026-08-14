import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("locale and production route proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["/en/admin", "/et/broadcast", "/en/broadcast/watch"])(
    "hard-404s the development-only route %s at the production request boundary",
    async (path) => {
      vi.stubEnv("NODE_ENV", "production");

      const response = proxy(new NextRequest(`https://rada.invalid${path}`));

      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
      await expect(response.text()).resolves.toBe("Not found");
    },
  );

  it("does not hide similarly named public routes in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = proxy(new NextRequest("https://rada.invalid/en/broadcasting"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps localized public routes available outside production", () => {
    vi.stubEnv("NODE_ENV", "test");

    const response = proxy(new NextRequest("https://rada.invalid/en"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-request-x-rada-locale")).toBe("en");
  });
});
