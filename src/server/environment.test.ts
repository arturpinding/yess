import { parseEnvironment } from "./environment";

const validEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://rada:password@localhost:5432/rada",
  SESSION_SECRET: "session-secret-that-is-at-least-thirty-two-characters",
  MEDIA_SIGNING_SECRET: "different-media-secret-that-is-at-least-thirty-two",
  APP_ORIGIN: "http://localhost:3000/",
  DEFAULT_COUNTRY: "ee",
  LOG_LEVEL: "info",
};

describe("environment validation", () => {
  it("normalizes safe values", () => {
    expect(parseEnvironment(validEnvironment)).toMatchObject({
      APP_ORIGIN: "http://localhost:3000",
      DEFAULT_COUNTRY: "EE",
    });
  });

  it("requires distinct secrets and HTTPS in production", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        SESSION_SECRET: "same-secret-that-is-long-enough-for-both-values",
        MEDIA_SIGNING_SECRET: "same-secret-that-is-long-enough-for-both-values",
      }),
    ).toThrow();
  });

  it("requires provider URL and token together", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        MEDIA_PROVIDER_URL: "http://127.0.0.1:8090",
      }),
    ).toThrow();
    expect(
      parseEnvironment({
        ...validEnvironment,
        MEDIA_PROVIDER_URL: "http://127.0.0.1:8090",
        MEDIA_PROVIDER_TOKEN: "provider-token-that-is-at-least-thirty-two-characters",
      }),
    ).toMatchObject({ MEDIA_PROVIDER_URL: "http://127.0.0.1:8090" });
  });

  it("requires HTTPS for a production provider endpoint", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        APP_ORIGIN: "https://rada.example",
        MEDIA_PROVIDER_URL: "http://media-provider.internal",
        MEDIA_PROVIDER_TOKEN: "provider-token-that-is-at-least-thirty-two-characters",
      }),
    ).toThrow();
  });

  it("requires authenticated TURN when phone broadcast is enabled in production", () => {
    const productionEnvironment = {
      ...validEnvironment,
      NODE_ENV: "production",
      APP_ORIGIN: "https://rada.example",
      PHONE_BROADCAST_ENABLED: "true",
    };

    expect(() => parseEnvironment(productionEnvironment)).toThrow();
    expect(
      parseEnvironment({
        ...productionEnvironment,
        PHONE_BROADCAST_ICE_SERVERS_JSON: JSON.stringify([
          {
            urls: "turns:turn.example.test:443?transport=tcp",
            username: "short-lived-user",
            credential: "short-lived-credential",
          },
        ]),
      }),
    ).toMatchObject({ PHONE_BROADCAST_ENABLED: true });
  });

  it("requires managed provider credentials but not TURN for LiveKit Cloud", () => {
    const managedEnvironment = {
      ...validEnvironment,
      NODE_ENV: "production",
      APP_ORIGIN: "https://rada.example",
      PHONE_BROADCAST_ENABLED: "true",
      PHONE_BROADCAST_PROVIDER: "livekit-cloud",
    };

    expect(() => parseEnvironment(managedEnvironment)).toThrow();
    expect(
      parseEnvironment({
        ...managedEnvironment,
        PHONE_BROADCAST_ACCESS_KEY: "strong-private-broadcast-key",
        LIVEKIT_URL: "wss://project-123.livekit.cloud",
        LIVEKIT_API_KEY: "APILiveKitKey1234",
        LIVEKIT_API_SECRET: "livekit-secret-that-is-long-and-private",
      }),
    ).toMatchObject({
      PHONE_BROADCAST_ENABLED: true,
      PHONE_BROADCAST_PROVIDER: "livekit-cloud",
      LIVEKIT_URL: "wss://project-123.livekit.cloud",
    });
  });

  it.each([
    "https://project-123.livekit.cloud",
    "wss://user:password@project-123.livekit.cloud",
    "wss://project-123.livekit.cloud?token=secret",
    "wss://project-123.livekit.cloud#fragment",
    "wss://project-123.livekit.cloud/rooms/demo",
    "wss://project-123.livekit.cloud:7443",
    "wss://media.rada.example",
  ])("rejects an unsafe LiveKit URL: %s", (LIVEKIT_URL) => {
    expect(() => parseEnvironment({ ...validEnvironment, LIVEKIT_URL })).toThrow();
  });
});
