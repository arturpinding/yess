type DemoBroadcastAvailabilityEnvironment = {
  LIVEKIT_URL?: string;
  NODE_ENV?: string;
  PHONE_BROADCAST_ENABLED?: string;
  PHONE_BROADCAST_PROVIDER?: string;
};

export type PhoneBroadcastProvider = "direct" | "livekit-cloud";

/**
 * LiveKit clients accept a project WebSocket URL. Keep parsing shared with the
 * CSP builder so an invalid value can never widen browser network access.
 */
export function parseLiveKitUrl(value: string | undefined): URL | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "wss:" ||
      !url.hostname.endsWith(".livekit.cloud") ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

export function getPhoneBroadcastProvider(
  environment: DemoBroadcastAvailabilityEnvironment = process.env,
): PhoneBroadcastProvider {
  return environment.PHONE_BROADCAST_PROVIDER === "livekit-cloud" ? "livekit-cloud" : "direct";
}

/**
 * Development keeps the demo available by default. A production-shaped build
 * must opt in explicitly so the route cannot appear after an accidental deploy.
 */
export function isDemoBroadcastAvailable(
  environment: DemoBroadcastAvailabilityEnvironment = process.env,
): boolean {
  return environment.NODE_ENV !== "production" || environment.PHONE_BROADCAST_ENABLED === "true";
}

export function isDirectDemoBroadcastAvailable(
  environment: DemoBroadcastAvailabilityEnvironment = process.env,
): boolean {
  return (
    isDemoBroadcastAvailable(environment) && getPhoneBroadcastProvider(environment) === "direct"
  );
}

export function isManagedBroadcastAvailable(
  environment: DemoBroadcastAvailabilityEnvironment = process.env,
): boolean {
  return (
    isDemoBroadcastAvailable(environment) &&
    getPhoneBroadcastProvider(environment) === "livekit-cloud"
  );
}

export function getLiveKitConnectSources(
  environment: DemoBroadcastAvailabilityEnvironment = process.env,
): readonly string[] {
  if (!isManagedBroadcastAvailable(environment)) return [];

  const url = parseLiveKitUrl(environment.LIVEKIT_URL);
  if (!url) return [];

  return ["https://*.livekit.cloud", "wss://*.livekit.cloud"];
}
