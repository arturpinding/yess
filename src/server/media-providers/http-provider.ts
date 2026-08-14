import { getEnvironment } from "@/server/environment";
import {
  MediaProviderError,
  mediaProviderResultSchema,
  type MediaProvider,
  type MediaProviderOperationRequest,
  type MediaProviderResult,
} from "./contracts";

const LOCAL_PROVIDER_KEY = "local-ffmpeg";
const LOCAL_PROVIDER_URL = "http://127.0.0.1:8090";
const LOCAL_PROVIDER_TOKEN = "rada-local-media-provider-development-only";
const MAX_RESPONSE_BYTES = 32_768;

export interface HttpMediaProviderOptions {
  baseUrl: string;
  token: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

function normalizedProviderUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.username || url.password || url.search || url.hash) {
    throw new MediaProviderError("provider_configuration_invalid", 500);
  }
  if (process.env.NODE_ENV === "production") {
    if (url.protocol !== "https:") {
      throw new MediaProviderError("provider_configuration_invalid", 500);
    }
  } else if (
    url.protocol !== "http:" ||
    (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
  ) {
    throw new MediaProviderError("provider_configuration_invalid", 500);
  }
  return url;
}

export class HttpMediaProvider implements MediaProvider {
  private readonly baseUrl: URL;
  private readonly token: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HttpMediaProviderOptions) {
    this.baseUrl = normalizedProviderUrl(options.baseUrl);
    if (options.token.length < 32) {
      throw new MediaProviderError("provider_configuration_invalid", 500);
    }
    this.token = options.token;
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 12_000;
  }

  async execute(request: MediaProviderOperationRequest): Promise<MediaProviderResult> {
    const endpoint = new URL(
      `/v1/streams/${encodeURIComponent(request.providerResourceId)}/${request.action}`,
      this.baseUrl,
    );
    let response: Response;
    try {
      response = await this.fetcher(endpoint, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.token}`,
          "content-type": "application/json",
          "idempotency-key": request.idempotencyKey,
        },
        body: "{}",
      });
    } catch (error) {
      if (error instanceof MediaProviderError) throw error;
      throw new MediaProviderError("provider_unreachable", 502);
    }

    const body = await response.text();
    if (body.length > MAX_RESPONSE_BYTES) {
      throw new MediaProviderError("provider_response_too_large", 502);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new MediaProviderError("provider_response_invalid", 502);
    }
    if (!response.ok) {
      const code =
        parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as { error?: { code?: unknown } }).error?.code ?? "provider_rejected")
          : "provider_rejected";
      throw new MediaProviderError(code.slice(0, 120), response.status >= 500 ? 502 : 409);
    }

    const validated = mediaProviderResultSchema.safeParse(parsed);
    if (
      !validated.success ||
      validated.data.providerKey !== request.providerKey ||
      validated.data.providerResourceId !== request.providerResourceId
    ) {
      throw new MediaProviderError("provider_response_invalid", 502);
    }
    return validated.data;
  }
}

export function getConfiguredMediaProvider(providerKey: string): MediaProvider {
  if (providerKey !== LOCAL_PROVIDER_KEY) {
    throw new MediaProviderError("provider_not_configured", 422);
  }
  const environment = getEnvironment();
  return new HttpMediaProvider({
    baseUrl: environment.MEDIA_PROVIDER_URL ?? LOCAL_PROVIDER_URL,
    token: environment.MEDIA_PROVIDER_TOKEN ?? LOCAL_PROVIDER_TOKEN,
  });
}
