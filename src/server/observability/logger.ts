import pino, { type DestinationStream, type Logger } from "pino";

const DEFAULT_REDACT_PATHS = [
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "sessionToken",
  "playbackToken",
  "secret",
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.secret",
  "req.headers.authorization",
  "req.headers.cookie",
  "request.headers.authorization",
  "request.headers.cookie",
] as const;

export interface CreateLoggerOptions {
  service?: string;
  level?: string;
  environment?: string;
  version?: string;
  destination?: DestinationStream;
}

/** Creates JSON logs with stable service fields and secret-bearing paths redacted. */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  return pino(
    {
      level: options.level ?? "info",
      base: {
        service: options.service ?? "rada-web",
        environment: options.environment,
        version: options.version,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [...DEFAULT_REDACT_PATHS],
        censor: "[REDACTED]",
      },
    },
    options.destination,
  );
}

export interface RequestLogContext {
  requestId: string;
  route?: string;
  userId?: string;
  profileId?: string;
}

export function requestLogger(parent: Logger, context: RequestLogContext): Logger {
  return parent.child({
    requestId: context.requestId,
    route: context.route,
    userId: context.userId,
    profileId: context.profileId,
  });
}
