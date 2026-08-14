import { z } from "zod";

const emptyToUndefined = (value: unknown): unknown => (value === "" ? undefined : value);

const optionalNonEmptyString = z.preprocess(emptyToUndefined, z.string().trim().min(1).optional());

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
        "DATABASE_URL must be a PostgreSQL URL",
      ),
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must contain at least 32 characters"),
    MEDIA_SIGNING_SECRET: z
      .string()
      .min(32, "MEDIA_SIGNING_SECRET must contain at least 32 characters"),
    APP_ORIGIN: z
      .string()
      .url()
      .transform((value) => value.replace(/\/$/, "")),
    DEFAULT_COUNTRY: z
      .string()
      .regex(/^[A-Za-z]{2}$/, "DEFAULT_COUNTRY must be an ISO 3166-1 alpha-2 code")
      .transform((value) => value.toUpperCase()),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    REDIS_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
    PAYMENT_PROVIDER: optionalNonEmptyString,
    PUSH_PROVIDER: optionalNonEmptyString,
    EMAIL_PROVIDER: optionalNonEmptyString,
    MEDIA_PROVIDER_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
    MEDIA_PROVIDER_TOKEN: z.preprocess(
      emptyToUndefined,
      z.string().min(32, "MEDIA_PROVIDER_TOKEN must contain at least 32 characters").optional(),
    ),
  })
  .superRefine((environment, context) => {
    if (environment.SESSION_SECRET === environment.MEDIA_SIGNING_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["MEDIA_SIGNING_SECRET"],
        message: "Media and session signing secrets must be different",
      });
    }

    if (environment.NODE_ENV === "production") {
      if (!environment.APP_ORIGIN.startsWith("https://")) {
        context.addIssue({
          code: "custom",
          path: ["APP_ORIGIN"],
          message: "APP_ORIGIN must use HTTPS in production",
        });
      }

      for (const [name, secret] of [
        ["SESSION_SECRET", environment.SESSION_SECRET],
        ["MEDIA_SIGNING_SECRET", environment.MEDIA_SIGNING_SECRET],
      ] as const) {
        if (/replace|development|example|changeme/i.test(secret)) {
          context.addIssue({
            code: "custom",
            path: [name],
            message: `${name} still contains a placeholder value`,
          });
        }
      }

      if (
        environment.MEDIA_PROVIDER_URL &&
        !environment.MEDIA_PROVIDER_URL.startsWith("https://")
      ) {
        context.addIssue({
          code: "custom",
          path: ["MEDIA_PROVIDER_URL"],
          message: "MEDIA_PROVIDER_URL must use HTTPS in production",
        });
      }
    }

    if (Boolean(environment.MEDIA_PROVIDER_URL) !== Boolean(environment.MEDIA_PROVIDER_TOKEN)) {
      context.addIssue({
        code: "custom",
        path: [environment.MEDIA_PROVIDER_URL ? "MEDIA_PROVIDER_TOKEN" : "MEDIA_PROVIDER_URL"],
        message: "MEDIA_PROVIDER_URL and MEDIA_PROVIDER_TOKEN must be configured together",
      });
    }
  });

export type AppEnvironment = z.infer<typeof environmentSchema>;

export function parseEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): AppEnvironment {
  return environmentSchema.parse(source);
}

let cachedEnvironment: AppEnvironment | undefined;

/** Lazy parsing avoids import-time failures in tooling that does not load `.env`. */
export function getEnvironment(): AppEnvironment {
  cachedEnvironment ??= parseEnvironment(process.env);
  return cachedEnvironment;
}

export function clearEnvironmentCacheForTests(): void {
  cachedEnvironment = undefined;
}
