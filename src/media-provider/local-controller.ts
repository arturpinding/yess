import { randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type {
  MediaProviderAction,
  MediaProviderResourceState,
  MediaProviderResult,
} from "@/server/media-providers/contracts";

const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

interface LocalResource {
  providerResourceId: string;
  observedState: MediaProviderResourceState;
  published: boolean;
  playbackLocator: string;
  child: ChildProcess | null;
  stopping: boolean;
  healthyAt: Date | null;
}

interface CachedOperation {
  signature: string;
  result: MediaProviderResult;
}

export class LocalMediaProviderError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 409) {
    super(code);
    this.name = "LocalMediaProviderError";
    this.code = code;
    this.status = status;
  }
}

export interface LocalMediaControllerOptions {
  outputRoot?: string;
  publicBaseUrl?: string;
  ffmpegBinary?: string;
  spawnProcess?: typeof spawn;
  now?: () => Date;
}

function assertReference(reference: string): void {
  if (!REFERENCE_PATTERN.test(reference)) {
    throw new LocalMediaProviderError("invalid_provider_reference", 400);
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

export function assertLocalMediaTransition(
  state: MediaProviderResourceState,
  published: boolean,
  action: MediaProviderAction,
): void {
  if (action === "refresh") return;
  if (action === "provision") {
    if (["absent", "provisioned", "stopped", "failed"].includes(state)) return;
  } else if (action === "start") {
    if (["provisioned", "stopped", "encoding", "published"].includes(state)) return;
  } else if (action === "publish") {
    if (["encoding", "published"].includes(state)) return;
  } else if (action === "unpublish") {
    if (published || ["encoding", "stopped", "provisioned"].includes(state)) return;
  } else if (action === "stop") {
    if (!published && ["provisioned", "encoding", "stopped", "failed"].includes(state)) return;
    if (published) throw new LocalMediaProviderError("must_unpublish_first");
  }
  throw new LocalMediaProviderError("invalid_provider_transition");
}

export class LocalMediaController {
  readonly outputRoot: string;
  private readonly publicBaseUrl: string;
  private readonly ffmpegBinary: string;
  private readonly spawnProcess: typeof spawn;
  private readonly now: () => Date;
  private readonly resources = new Map<string, LocalResource>();
  private readonly operations = new Map<string, CachedOperation>();

  constructor(options: LocalMediaControllerOptions = {}) {
    this.outputRoot = resolve(options.outputRoot ?? ".local-media");
    this.publicBaseUrl = (options.publicBaseUrl ?? "http://127.0.0.1:8090").replace(/\/$/u, "");
    this.ffmpegBinary = options.ffmpegBinary ?? "ffmpeg";
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.now = options.now ?? (() => new Date());
  }

  private resourceDirectory(reference: string): string {
    assertReference(reference);
    return join(this.outputRoot, reference);
  }

  private manifestPath(reference: string): string {
    return join(this.resourceDirectory(reference), "index.m3u8");
  }

  private playbackLocator(reference: string): string {
    return `${this.publicBaseUrl}/media/${encodeURIComponent(reference)}/index.m3u8`;
  }

  private getOrCreateResource(reference: string): LocalResource {
    assertReference(reference);
    const existing = this.resources.get(reference);
    if (existing) return existing;
    const created: LocalResource = {
      providerResourceId: reference,
      observedState: "absent",
      published: false,
      playbackLocator: this.playbackLocator(reference),
      child: null,
      stopping: false,
      healthyAt: null,
    };
    this.resources.set(reference, created);
    return created;
  }

  private snapshot(resource: LocalResource, providerRequestId: string): MediaProviderResult {
    return {
      providerRequestId,
      providerKey: "local-ffmpeg",
      providerResourceId: resource.providerResourceId,
      observedState: resource.observedState,
      published: resource.published,
      playbackLocator:
        resource.observedState === "absent" || resource.observedState === "failed"
          ? null
          : resource.playbackLocator,
      healthy: resource.healthyAt !== null && resource.observedState !== "failed",
      occurredAt: this.now().toISOString(),
    };
  }

  private async waitForManifest(resource: LocalResource): Promise<void> {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (resource.child?.exitCode !== null) break;
      try {
        const details = await stat(this.manifestPath(resource.providerResourceId));
        if (details.size > 0) {
          resource.healthyAt = this.now();
          return;
        }
      } catch {
        // The first playlist appears only after FFmpeg closes its first segment.
      }
      await wait(100);
    }
    throw new LocalMediaProviderError("encoder_start_failed", 502);
  }

  private spawnEncoder(resource: LocalResource): ChildProcess {
    const directory = this.resourceDirectory(resource.providerResourceId);
    const child = this.spawnProcess(
      this.ffmpegBinary,
      [
        "-hide_banner",
        "-loglevel",
        "warning",
        "-re",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=854x480:rate=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=880:sample_rate=48000",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
        "-pix_fmt",
        "yuv420p",
        "-g",
        "60",
        "-keyint_min",
        "60",
        "-sc_threshold",
        "0",
        "-b:v",
        "900k",
        "-maxrate",
        "1100k",
        "-bufsize",
        "1800k",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-ar",
        "48000",
        "-f",
        "hls",
        "-hls_time",
        "2",
        "-hls_list_size",
        "12",
        "-hls_flags",
        "delete_segments+append_list+independent_segments+program_date_time",
        "-hls_segment_filename",
        join(directory, "segment-%06d.ts"),
        join(directory, "index.m3u8"),
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    child.stderr?.on("data", () => undefined);
    child.once("error", () => {
      resource.observedState = "failed";
      resource.published = false;
      resource.child = null;
      resource.healthyAt = null;
    });
    child.once("exit", () => {
      resource.child = null;
      resource.healthyAt = null;
      if (resource.stopping) {
        resource.stopping = false;
        resource.observedState = "stopped";
      } else {
        resource.observedState = "failed";
        resource.published = false;
      }
    });
    return child;
  }

  private async stopEncoder(resource: LocalResource): Promise<void> {
    const child = resource.child;
    if (!child || child.exitCode !== null) {
      resource.child = null;
      resource.observedState = "stopped";
      resource.healthyAt = null;
      return;
    }
    resource.stopping = true;
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolvePromise) => child.once("exit", () => resolvePromise())),
      wait(3_000).then(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }),
    ]);
    resource.child = null;
    resource.observedState = "stopped";
    resource.healthyAt = null;
  }

  private async refresh(resource: LocalResource): Promise<void> {
    const running = resource.child !== null && resource.child.exitCode === null;
    if (running) {
      try {
        const details = await stat(this.manifestPath(resource.providerResourceId));
        if (this.now().getTime() - details.mtime.getTime() <= 12_000) {
          resource.healthyAt = this.now();
          resource.observedState = resource.published ? "published" : "encoding";
          return;
        }
      } catch {
        // Keep the encoder state but report unhealthy until a playlist exists.
      }
      resource.healthyAt = null;
      resource.observedState = resource.published ? "published" : "encoding";
    } else if (["encoding", "published"].includes(resource.observedState)) {
      resource.observedState = "failed";
      resource.published = false;
      resource.healthyAt = null;
    }
  }

  async execute(
    reference: string,
    action: MediaProviderAction,
    idempotencyKey: string,
  ): Promise<MediaProviderResult> {
    assertReference(reference);
    const signature = `${reference}:${action}`;
    const cached = this.operations.get(idempotencyKey);
    if (cached) {
      if (cached.signature !== signature) {
        throw new LocalMediaProviderError("idempotency_conflict");
      }
      return cached.result;
    }

    const resource = this.getOrCreateResource(reference);
    await this.refresh(resource);
    assertLocalMediaTransition(resource.observedState, resource.published, action);

    if (action === "provision") {
      await mkdir(this.resourceDirectory(reference), { recursive: true, mode: 0o750 });
      resource.observedState = "provisioned";
      resource.published = false;
      resource.healthyAt = this.now();
    } else if (action === "start" && resource.child === null) {
      await mkdir(this.resourceDirectory(reference), { recursive: true, mode: 0o750 });
      resource.child = this.spawnEncoder(resource);
      resource.observedState = "encoding";
      resource.published = false;
      try {
        await this.waitForManifest(resource);
      } catch (error) {
        await this.stopEncoder(resource);
        resource.observedState = "failed";
        throw error;
      }
    } else if (action === "publish") {
      await stat(this.manifestPath(reference)).catch(() => {
        throw new LocalMediaProviderError("manifest_not_ready");
      });
      resource.published = true;
      resource.observedState = "published";
      resource.healthyAt = this.now();
    } else if (action === "unpublish") {
      resource.published = false;
      resource.observedState = resource.child ? "encoding" : "stopped";
    } else if (action === "stop") {
      await this.stopEncoder(resource);
    } else if (action === "refresh") {
      await this.refresh(resource);
    }

    const result = this.snapshot(resource, randomUUID());
    this.operations.set(idempotencyKey, { signature, result });
    if (this.operations.size > 1_000) {
      const oldestKey = this.operations.keys().next().value;
      if (oldestKey) this.operations.delete(oldestKey);
    }
    return result;
  }

  async shutdown(): Promise<void> {
    await Promise.all(
      [...this.resources.values()].map(async (resource) => {
        resource.published = false;
        await this.stopEncoder(resource);
      }),
    );
  }

  mediaPath(reference: string, filename: string): string | null {
    assertReference(reference);
    if (!/^(?:index\.m3u8|segment-[0-9]{6}\.ts)$/u.test(filename)) return null;
    const resource = this.resources.get(reference);
    if (!resource?.published) return null;
    return join(this.resourceDirectory(reference), filename);
  }

  summary(): { resources: number; encoding: number; published: number } {
    const resources = [...this.resources.values()];
    return {
      resources: resources.length,
      encoding: resources.filter((resource) => resource.child?.exitCode === null).length,
      published: resources.filter((resource) => resource.published).length,
    };
  }
}
