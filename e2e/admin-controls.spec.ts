import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

type AdminStreamMutation = {
  id: string;
  updatedAt: string;
  state: string;
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
