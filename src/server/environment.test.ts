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
});
