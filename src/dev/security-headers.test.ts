async function loadNextConfig(nodeEnvironment: string, phoneDemoHost = "") {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnvironment);
  vi.stubEnv("PHONE_DEMO_HOST", phoneDemoHost);
  return (await import("../../next.config")).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("broadcast security headers", () => {
  it("enables camera/microphone only on the exact development broadcaster route", async () => {
    const nextConfig = await loadNextConfig("development");
    const rules = await nextConfig.headers?.();
    expect(rules).toBeDefined();

    const generalPolicy = rules
      ?.find((rule) => rule.source === "/:path*")
      ?.headers.find((header) => header.key === "Permissions-Policy")?.value;
    const broadcasterPolicy = rules
      ?.find((rule) => rule.source === "/:locale(et|en)/broadcast")
      ?.headers.find((header) => header.key === "Permissions-Policy")?.value;

    expect(generalPolicy).toContain("camera=()");
    expect(generalPolicy).toContain("microphone=()");
    expect(broadcasterPolicy).toContain("camera=(self)");
    expect(broadcasterPolicy).toContain("microphone=(self)");
  });

  it("allows only the validated phone demo host as an additional development origin", async () => {
    const nextConfig = await loadNextConfig("development", "192.168.1.42");
    expect(nextConfig.allowedDevOrigins).toEqual(["192.168.1.42"]);
  });

  it("keeps camera/microphone denied and has no phone origin in production", async () => {
    const nextConfig = await loadNextConfig("production", "192.168.1.42");
    const rules = await nextConfig.headers?.();

    expect(nextConfig.allowedDevOrigins).toEqual([]);
    expect(rules?.some((rule) => rule.source === "/:locale(et|en)/broadcast")).toBe(false);
    const generalPolicy = rules
      ?.find((rule) => rule.source === "/:path*")
      ?.headers.find((header) => header.key === "Permissions-Policy")?.value;
    expect(generalPolicy).toContain("camera=()");
    expect(generalPolicy).toContain("microphone=()");
  });
});
