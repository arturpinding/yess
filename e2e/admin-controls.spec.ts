import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

type AdminStreamMutation = {
  id: string;
  updatedAt: string;
  state: string;
  playbackLocator?: string | null;
  providerStreamRef?: string;
};

type AdminMediaOperationMutation = {
  operation: { id: string; state: string };
  resource: { id: string; observedState: string };
  stream: AdminStreamMutation;
};

type AdminRightsMutation = {
  id: string;
  updatedAt: string;
  contractReference: string | null;
};

type AdminEventMutation = {
  id: string;
  version: number;
};

async function browserMutation<T>(
  page: Page,
  path: string,
  method: "PATCH" | "DELETE",
  body: Record<string, unknown>,
) {
  return page.evaluate(
    async ({ path: requestPath, method: requestMethod, body: requestBody }) => {
      const csrf = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("rada-csrf="))
        ?.slice("rada-csrf=".length);
      if (!csrf) throw new Error("Missing development CSRF cookie");
      const response = await fetch(requestPath, {
        method: requestMethod,
        headers: {
          "Content-Type": "application/json",
          "X-RADA-Request": "browser-mutation",
          "X-CSRF-Token": decodeURIComponent(csrf),
        },
        body: JSON.stringify(requestBody),
      });
      return { ok: response.ok, status: response.status, payload: (await response.json()) as T };
    },
    { path, method, body },
  );
}

async function browserProviderOperation<T>(
  page: Page,
  streamId: string,
  action: "provision" | "start" | "publish" | "unpublish" | "stop" | "refresh",
  expectedUpdatedAt: string,
  reason: string,
) {
  return page.evaluate(
    async ({ streamId, action, expectedUpdatedAt, reason }) => {
      const csrf = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("rada-csrf="))
        ?.slice("rada-csrf=".length);
      if (!csrf) throw new Error("Missing development CSRF cookie");
      const response = await fetch(`/api/v1/admin/streams/${streamId}/operations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `e2e:${streamId}:${action}:${crypto.randomUUID()}`,
          "X-RADA-Request": "browser-provider-operation",
          "X-CSRF-Token": decodeURIComponent(csrf),
        },
        body: JSON.stringify({ action, expectedUpdatedAt, reason }),
      });
      return { ok: response.ok, status: response.status, payload: (await response.json()) as T };
    },
    { streamId, action, expectedUpdatedAt, reason },
  );
}

test.beforeEach(async ({ page }, testInfo) => {
  const offset = testInfo.project.name === "mobile-chromium" ? 31 : 32;
  await page.setExtraHTTPHeaders({ "x-real-ip": `198.51.100.${offset}` });
});

test("development control room is responsive, accessible, and available without a login page", async ({
  page,
}) => {
  const response = await page.goto("/en/admin");

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Live control" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Playback sources" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Event control" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /sign in/i })).toHaveCount(0);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("operator can create, retire, and delete a fallback and edit an event with audit reasons", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "One mutation pass avoids duplicate audit records across browser projects",
  );

  await page.goto("/en/admin");
  const suffix = `${Date.now()}`;
  const provider = "RADA E2E origin";
  const providerReference = `rada-e2e-fallback-${suffix}`;
  const streamReason = `E2E admin control creates fallback ${suffix}`;
  let streamCleanup: AdminStreamMutation | undefined;
  let eventCleanup:
    (AdminEventMutation & { path: string; originalStatusDetailEn: string | null }) | undefined;

  try {
    await page.getByRole("button", { name: "Add fallback source" }).click();
    const createButton = page.getByRole("button", { name: "Create source" });
    const createForm = createButton.locator("xpath=ancestor::form");
    await createForm.getByLabel("Provider", { exact: true }).fill(provider);
    await createForm.getByLabel("Provider stream reference").fill(providerReference);
    await createForm
      .getByLabel("Playback URL")
      .fill("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8");
    await createForm.getByLabel("Reason for change").fill(streamReason);

    const createdResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith("/api/v1/admin/streams") &&
        candidate.request().method() === "POST",
    );
    await createButton.click();
    const createResult = await createdResponse;
    expect(createResult.status()).toBe(201);
    const created = (await createResult.json()) as { data: AdminStreamMutation };
    streamCleanup = created.data;

    const streamSection = page.getByRole("region", { name: "Playback sources" });
    let streamRecord = streamSection.locator("details").filter({ hasText: provider });
    await expect(streamRecord).toHaveCount(1);
    await streamRecord.locator("summary").click();
    await streamRecord.getByLabel("State").selectOption("unavailable");
    await streamRecord
      .getByLabel("Reason for change")
      .fill(`E2E admin control retires fallback ${suffix}`);
    await streamRecord.getByRole("button", { name: "Save changes" }).click();
    const retireDialog = page.getByRole("alertdialog", { name: "Confirm operational change" });
    await expect(retireDialog).toBeVisible();
    const retiredResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().includes(`/api/v1/admin/streams/${created.data.id}`) &&
        candidate.request().method() === "PATCH",
    );
    await retireDialog.getByRole("button", { name: "Confirm change" }).click();
    const retireResult = await retiredResponse;
    expect(retireResult.status()).toBe(200);
    const retired = (await retireResult.json()) as { data: AdminStreamMutation };
    streamCleanup = retired.data;

    streamRecord = streamSection.locator("details").filter({ hasText: provider });
    await streamRecord
      .getByLabel("Reason for change")
      .fill(`E2E admin control deletes fallback ${suffix}`);
    const deleteButton = streamRecord.getByRole("button", { name: "Delete demo source" });
    await expect(deleteButton).toBeEnabled();
    await deleteButton.click();
    const deleteDialog = page.getByRole("alertdialog", { name: "Delete demo source?" });
    await deleteDialog.getByLabel("Type the stream reference to confirm").fill(providerReference);
    const deletedResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().includes(`/api/v1/admin/streams/${created.data.id}`) &&
        candidate.request().method() === "DELETE",
    );
    await deleteDialog.getByRole("button", { name: "Delete source" }).click();
    expect((await deletedResponse).status()).toBe(200);
    streamCleanup = undefined;
    await expect(streamSection.locator("details").filter({ hasText: provider })).toHaveCount(0);

    const eventSection = page.getByRole("region", { name: "Event control" });
    let eventRecord = eventSection.locator("details").first();
    await eventRecord.locator("summary").click();
    const statusDetail = eventRecord.getByLabel("English status detail");
    const originalStatusDetailEn = await statusDetail.inputValue();
    const eventReason = `E2E admin control edits event ${suffix}`;
    await statusDetail.fill(`Operator verification ${suffix}`);
    await eventRecord.getByLabel("Reason for change").fill(eventReason);
    const eventUpdatedResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/v1/admin/events/") &&
        candidate.request().method() === "PATCH",
    );
    await eventRecord.getByRole("button", { name: "Save changes" }).click();
    const eventUpdateResult = await eventUpdatedResponse;
    expect(eventUpdateResult.status()).toBe(200);
    const eventUpdated = (await eventUpdateResult.json()) as { data: AdminEventMutation };
    eventCleanup = {
      ...eventUpdated.data,
      path: new URL(eventUpdateResult.url()).pathname,
      originalStatusDetailEn: originalStatusDetailEn || null,
    };
    await expect(page.getByText(eventReason, { exact: false })).toBeVisible({ timeout: 15_000 });

    eventRecord = eventSection.locator("details").first();
    await eventRecord.getByLabel("English status detail").fill(originalStatusDetailEn);
    await eventRecord
      .getByLabel("Reason for change")
      .fill(`E2E admin control restores event ${suffix}`);
    const restoredResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/v1/admin/events/") &&
        candidate.request().method() === "PATCH",
    );
    await eventRecord.getByRole("button", { name: "Save changes" }).click();
    expect((await restoredResponse).status()).toBe(200);
    eventCleanup = undefined;
  } finally {
    if (eventCleanup) {
      await browserMutation<{ data?: AdminEventMutation }>(page, eventCleanup.path, "PATCH", {
        reason: `E2E admin control emergency event restore ${suffix}`,
        version: eventCleanup.version,
        statusDetailEn: eventCleanup.originalStatusDetailEn,
      });
    }
    if (streamCleanup) {
      if (streamCleanup.state !== "ended" && streamCleanup.state !== "unavailable") {
        const disabled = await browserMutation<{ data?: AdminStreamMutation }>(
          page,
          `/api/v1/admin/streams/${streamCleanup.id}`,
          "PATCH",
          {
            reason: `E2E admin control emergency source retire ${suffix}`,
            expectedUpdatedAt: streamCleanup.updatedAt,
            state: "unavailable",
          },
        );
        if (disabled.ok && disabled.payload.data) streamCleanup = disabled.payload.data;
      }
      await browserMutation(page, `/api/v1/admin/streams/${streamCleanup.id}`, "DELETE", {
        reason: `E2E admin control emergency source cleanup ${suffix}`,
        expectedUpdatedAt: streamCleanup.updatedAt,
      });
    }
  }
});

test("operator can publish and retire a real synthetic HLS stream from the control room", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "One encoder lifecycle avoids duplicate FFmpeg processes across browser projects",
  );

  await page.goto("/en/admin");
  const suffix = `${Date.now()}`;
  let streamCleanup: AdminStreamMutation | undefined;
  let providerReference = "";

  async function runUiOperation(
    action: "Provision" | "Start encoder" | "Publish local stream" | "Unpublish" | "Stop encoder",
    confirmationName?: string,
  ) {
    if (!streamCleanup) throw new Error("Missing stream under test");
    const localPanel = page.getByRole("region", { name: "Local media production" });
    const card = localPanel.locator("article").filter({ hasText: providerReference });
    await card
      .getByLabel("Operation reason")
      .fill(`E2E ${action.toLowerCase()} ${providerReference}`);
    const responsePromise = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith(`/api/v1/admin/streams/${streamCleanup?.id}/operations`) &&
        candidate.request().method() === "POST",
    );
    await card.getByRole("button", { name: action, exact: true }).click();
    if (confirmationName) {
      const dialog = page.getByRole("alertdialog", { name: confirmationName });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Confirm operation" }).click();
    }
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { data: AdminMediaOperationMutation };
    expect(body.data.operation.state).toBe("succeeded");
    streamCleanup = body.data.stream;
    return body.data;
  }

  try {
    await page.getByRole("button", { name: "Add local encoder" }).click();
    const createButton = page.getByRole("button", { name: "Create source" });
    const createForm = createButton.locator("xpath=ancestor::form");
    providerReference = await createForm.getByLabel("Provider stream reference").inputValue();
    expect(providerReference).toMatch(/^local-[A-Za-z0-9._-]+$/u);
    await expect(createForm.getByLabel("Provider", { exact: true })).toHaveValue("local-ffmpeg");
    await createForm.getByLabel("Reason for change").fill(`E2E creates local encoder ${suffix}`);

    const createResponsePromise = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith("/api/v1/admin/streams") &&
        candidate.request().method() === "POST",
    );
    await createButton.click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const created = (await createResponse.json()) as { data: AdminStreamMutation };
    streamCleanup = created.data;

    await page.reload();
    const localPanel = page.getByRole("region", { name: "Local media production" });
    await expect(
      localPanel.locator("article").filter({ hasText: providerReference }),
    ).toBeVisible();

    const provisioned = await runUiOperation("Provision");
    expect(provisioned.resource.observedState).toBe("provisioned");
    const started = await runUiOperation("Start encoder");
    expect(started.resource.observedState).toBe("encoding");
    const published = await runUiOperation(
      "Publish local stream",
      "Publish the local synthetic stream?",
    );
    expect(published.resource.observedState).toBe("published");
    expect(published.stream.state).toBe("live");
    expect(published.stream.playbackLocator).toContain(`/media/${providerReference}/index.m3u8`);

    const manifest = await request.get(published.stream.playbackLocator!);
    expect(manifest.status()).toBe(200);
    expect(await manifest.text()).toContain("#EXTM3U");

    const unpublished = await runUiOperation("Unpublish", "Unpublish the local stream?");
    expect(unpublished.resource.observedState).toBe("encoding");
    expect((await request.get(published.stream.playbackLocator!)).status()).toBe(404);

    const stopped = await runUiOperation("Stop encoder", "Stop the local encoder?");
    expect(stopped.resource.observedState).toBe("stopped");
    expect(stopped.stream.state).toBe("ended");

    const deleted = await browserMutation(
      page,
      `/api/v1/admin/streams/${stopped.stream.id}`,
      "DELETE",
      {
        reason: `E2E deletes stopped local encoder ${suffix}`,
        expectedUpdatedAt: stopped.stream.updatedAt,
      },
    );
    expect(deleted.status).toBe(200);
    streamCleanup = undefined;
  } finally {
    if (streamCleanup) {
      let cleanupStream: AdminStreamMutation = streamCleanup;
      for (const action of ["unpublish", "stop"] as const) {
        try {
          const result: {
            ok: boolean;
            status: number;
            payload: { data?: AdminMediaOperationMutation };
          } = await browserProviderOperation<{ data?: AdminMediaOperationMutation }>(
            page,
            cleanupStream.id,
            action,
            cleanupStream.updatedAt,
            `E2E emergency ${action} ${suffix}`,
          );
          if (result.ok && result.payload.data) cleanupStream = result.payload.data.stream;
        } catch {
          // Continue to fail-closed catalogue retirement below.
        }
      }
      if (cleanupStream.state !== "ended" && cleanupStream.state !== "unavailable") {
        const disabled = await browserMutation<{ data?: AdminStreamMutation }>(
          page,
          `/api/v1/admin/streams/${cleanupStream.id}`,
          "PATCH",
          {
            reason: `E2E emergency local source retirement ${suffix}`,
            expectedUpdatedAt: cleanupStream.updatedAt,
            state: "unavailable",
          },
        );
        if (disabled.ok && disabled.payload.data) cleanupStream = disabled.payload.data;
      }
      await browserMutation(page, `/api/v1/admin/streams/${cleanupStream.id}`, "DELETE", {
        reason: `E2E emergency local source cleanup ${suffix}`,
        expectedUpdatedAt: cleanupStream.updatedAt,
      });
    }
  }
});

test("operator can create and delete an inactive rights policy from the control room", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "One rights mutation pass avoids duplicate audit records across browser projects",
  );

  await page.goto("/en/admin");
  const suffix = `${Date.now()}`;
  const contractReference = `RADA-E2E-RIGHTS-${suffix}`;
  const priority = 20_000 + (Date.now() % 10_000);
  let rightsCleanup: AdminRightsMutation | undefined;

  try {
    const rightsPanel = page.getByRole("region", { name: "Viewing rights" });
    await rightsPanel.getByRole("button", { name: "Add rights window" }).click();
    const createButton = rightsPanel.getByRole("button", { name: "Create rights window" });
    const createForm = createButton.locator("xpath=ancestor::form");
    await createForm.getByLabel("Starts").fill("2020-01-15T12:00");
    await createForm.getByLabel("Ends").fill("2020-01-15T13:00");
    await createForm.getByLabel("Priority").fill(`${priority}`);
    await createForm.getByLabel("Rights holder").fill("RADA E2E synthetic policy");
    await createForm.getByLabel("Contract reference").fill(contractReference);
    await createForm
      .getByLabel("Reason for change")
      .fill(`E2E creates expired rights policy ${suffix}`);

    const createResponsePromise = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith("/api/v1/admin/rights-windows") &&
        candidate.request().method() === "POST",
    );
    await createButton.click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const created = (await createResponse.json()) as { data: AdminRightsMutation };
    rightsCleanup = created.data;

    const rightsRecord = rightsPanel.locator("details").filter({ hasText: contractReference });
    await expect(rightsRecord).toHaveCount(1);
    await rightsRecord.locator("summary").click();
    await rightsRecord
      .getByLabel("Reason for change")
      .fill(`E2E deletes expired rights policy ${suffix}`);
    const deleteButton = rightsRecord.getByRole("button", { name: "Delete inactive window" });
    await expect(deleteButton).toBeEnabled();
    await deleteButton.click();
    const deleteDialog = page.getByRole("alertdialog", { name: "Delete rights window?" });
    const deleteResponsePromise = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith(`/api/v1/admin/rights-windows/${rightsCleanup?.id}`) &&
        candidate.request().method() === "DELETE",
    );
    await deleteDialog.getByRole("button", { name: "Delete window" }).click();
    expect((await deleteResponsePromise).status()).toBe(200);
    rightsCleanup = undefined;
    await expect(rightsPanel.locator("details").filter({ hasText: contractReference })).toHaveCount(
      0,
    );
  } finally {
    if (rightsCleanup) {
      await browserMutation(page, `/api/v1/admin/rights-windows/${rightsCleanup.id}`, "DELETE", {
        reason: `E2E emergency expired rights cleanup ${suffix}`,
        expectedUpdatedAt: rightsCleanup.updatedAt,
      });
    }
  }
});
