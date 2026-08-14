import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertLocalMediaTransition,
  LocalMediaController,
  LocalMediaProviderError,
} from "./local-controller";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("local media provider lifecycle", () => {
  it("enforces publish-before-stop safety and legal transitions", () => {
    expect(() => assertLocalMediaTransition("provisioned", false, "start")).not.toThrow();
    expect(() => assertLocalMediaTransition("encoding", false, "publish")).not.toThrow();
    expect(() => assertLocalMediaTransition("published", true, "stop")).toThrowError(
      new LocalMediaProviderError("must_unpublish_first"),
    );
    expect(() => assertLocalMediaTransition("absent", false, "publish")).toThrowError(
      new LocalMediaProviderError("invalid_provider_transition"),
    );
  });

  it("provisions idempotently and rejects key reuse for another operation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rada-media-provider-"));
    temporaryDirectories.push(directory);
    const controller = new LocalMediaController({
      outputRoot: directory,
      now: () => new Date("2026-08-14T12:00:00.000Z"),
    });

    const first = await controller.execute("demo-source", "provision", "operation-key-0001");
    const replay = await controller.execute("demo-source", "provision", "operation-key-0001");
    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      providerKey: "local-ffmpeg",
      providerResourceId: "demo-source",
      observedState: "provisioned",
      published: false,
      healthy: true,
    });

    await expect(
      controller.execute("demo-source", "start", "operation-key-0001"),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
    await controller.shutdown();
  });

  it("rejects traversal-like provider references before filesystem access", async () => {
    const controller = new LocalMediaController();
    await expect(
      controller.execute("../escape", "provision", "operation-key-0002"),
    ).rejects.toMatchObject({
      code: "invalid_provider_reference",
    });
  });
});
