async function loadNextConfig(
  nodeEnvironment: string,
  phoneDemoHost = "",
  phoneBroadcastEnabled = "",
  phoneBroadcastProvider = "",
  liveKitUrl = "",
) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnvironment);
  vi.stubEnv("PHONE_DEMO_HOST", phoneDemoHost);
  vi.stubEnv("PHONE_BROADCAST_ENABLED", phoneBroadcastEnabled);
  vi.stubEnv("PHONE_BROADCAST_PROVIDER", phoneBroadcastProvider);
  vi.stubEnv("LIVEKIT_URL", liveKitUrl);
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

  it("allows camera/microphone on only the broadcaster route after production opt-in", async () => {
    const nextConfig = await loadNextConfig("production", "", "true");
    const rules = await nextConfig.headers?.();
    const broadcasterPolicy = rules
      ?.find((rule) => rule.source === "/:locale(et|en)/broadcast")
      ?.headers.find((header) => header.key === "Permissions-Policy")?.value;

    expect(broadcasterPolicy).toContain("camera=(self)");
    expect(broadcasterPolicy).toContain("microphone=(self)");
  });

  it("allows LiveKit regional hosts only for the selected managed provider", async () => {
    const liveKitUrl = "wss://project-123.livekit.cloud";
    const directConfig = await loadNextConfig("production", "", "true", "direct", liveKitUrl);
    const directRules = await directConfig.headers?.();
    const directCsp = directRules
      ?.find((rule) => rule.source === "/:path*")
      ?.headers.find((header) => header.key === "Content-Security-Policy")?.value;
    expect(directCsp).not.toContain("*.livekit.cloud");

    const managedConfig = await loadNextConfig(
      "production",
      "",
      "true",
      "livekit-cloud",
      liveKitUrl,
    );
    const managedRules = await managedConfig.headers?.();
    const managedCsp = managedRules
      ?.find((rule) => rule.source === "/:path*")
      ?.headers.find((header) => header.key === "Content-Security-Policy")?.value;
    expect(managedCsp).toContain("connect-src");
    expect(managedCsp).toContain("https://*.livekit.cloud");
    expect(managedCsp).toContain("wss://*.livekit.cloud");
  });
});
