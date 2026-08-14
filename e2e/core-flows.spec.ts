import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  const title = testInfo.titlePath.join(":");
  const hash = Array.from(title).reduce((total, character) => total + character.codePointAt(0)!, 0);
  await page.setExtraHTTPHeaders({ "x-real-ip": `198.51.100.${10 + (hash % 240)}` });
});

test.describe("RADA core experience", () => {
  test("renders a localized, responsive and accessible home experience", async ({
    page,
  }, testInfo) => {
    const response = await page.goto("/en");

    expect(await response?.text()).toContain('<html lang="en"');
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("heading", { name: "Everything that matters before the start." }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Live now" })).toBeVisible();
    await expect(page.getByText("Names, competitions and results", { exact: false })).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);

    const isMobile = testInfo.project.name === "mobile-chromium";
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible({
      visible: isMobile,
    });
    await expect(page.getByRole("complementary", { name: "Primary navigation" })).toBeVisible({
      visible: !isMobile,
    });

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);

    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);

    await page.getByRole("button", { name: "Light theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const lightAccessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(lightAccessibility.violations).toEqual([]);

    await page.context().setOffline(true);
    await expect(page.getByRole("status").filter({ hasText: "You are offline" })).toBeVisible();
    await page.context().setOffline(false);
    await expect(page.getByRole("status").filter({ hasText: "You are offline" })).toHaveCount(0);

    await page.getByRole("link", { name: "Language: ET" }).click();
    await expect(page).toHaveURL(/\/et$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "et");
    await expect(page.getByRole("heading", { name: "Kõik oluline enne avavilet." })).toBeVisible();
  });

  test("search and schedule filters lead to the intended content", async ({ page }) => {
    await page.goto("/en/discover?q=Liis%20Tamm");
    await expect(page.getByText("Liis Tamm", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("No results found")).toHaveCount(0);

    await page.goto("/en/schedule?sport=korvpall");
    await expect(
      page.getByText("Rheinburg BC vs Tartu Torm — DEMO", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Women's 10 km pursuit — DEMO", { exact: true })).toHaveCount(0);

    await page.goto("/en/schedule?competition=tallinna-jooksuohtu-demo");
    await expect(page.getByText("Women's 1500 m — DEMO", { exact: true })).toBeVisible();
    await expect(page.getByText("Rheinburg BC vs Tartu Torm — DEMO", { exact: true })).toHaveCount(
      0,
    );
  });

  test("spoiler-free mode redacts event and notification details", async ({ page }) => {
    await page.goto("/en/events/demo-naiste-uksikaeruline-kordus");
    await expect(page.getByText("Anu Saar finished second — DEMO result.")).toBeVisible();

    await page.getByRole("button", { name: "Hide results" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-spoilers", "hidden");
    await expect(
      page.locator("#main-content .result-hidden").getByText("Result hidden", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Anu Saar finished second — DEMO result.")).toHaveCount(0);

    await page.goto("/en/notifications");
    await expect(page.getByText("••••••••", { exact: true })).toBeVisible();
    await expect(page.getByText("Anu Saar", { exact: false })).toHaveCount(0);
  });

  test("authorized demo playback produces a real player without losing event context", async ({
    page,
  }) => {
    await page.goto("/en");
    await expect
      .poll(async () =>
        (await page.context().cookies()).some((cookie) => cookie.name === "rada-session"),
      )
      .toBe(true);

    const authorizationResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/playback-authorizations") &&
        response.request().method() === "POST",
    );
    await page.goto("/en/events/demo-laskesuusatamine-otse");
    const response = await authorizationResponse;
    expect(response.status()).toBe(201);
    const authorization = (await response.json()) as {
      allowed?: boolean;
      sources?: Array<{ kind: string }>;
    };
    expect(authorization.allowed).toBe(true);
    expect(authorization.sources?.some((source) => source.kind === "hls")).toBe(true);

    await expect(page.getByLabel("Women's 10 km pursuit — DEMO — Sports video")).toBeVisible();
    const player = page.getByRole("region", { name: "Women's 10 km pursuit — DEMO" });
    await player.focus();
    await player.press("m");
    await expect(page.getByRole("button", { name: "Unmute" })).toBeAttached();
    await expect(
      page.getByRole("heading", { name: "Women's 10 km pursuit — DEMO" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Viewing rights" })).toBeVisible();
    const playbackEnded = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith("/api/v1/playback-telemetry") &&
        candidate.request().postData()?.includes("playback_ended") === true,
    );
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
    expect((await playbackEnded).ok()).toBe(true);
    await page.goto("/en");
  });

  test("following an athlete updates My Sports and can be restored", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "One mutation pass avoids cross-project races",
    );

    await page.goto("/en/athletes/liis-tamm-demo");
    await expect
      .poll(async () =>
        (await page.context().cookies()).some((cookie) => cookie.name === "rada-session"),
      )
      .toBe(true);

    const follow = page.getByRole("button", { name: "Follow" });
    await expect(follow).toBeVisible();
    await follow.click();
    await expect(page.getByRole("button", { name: "Following" })).toBeVisible();

    await page.goto("/en/my-sports");
    const followedCard = page.locator("article").filter({ hasText: "Liis Tamm" });
    await expect(followedCard).toBeVisible();
    await followedCard.getByRole("button", { name: "Following" }).click();
    await expect(followedCard).toHaveCount(0);
  });

  test("global notification mode persists and can be restored", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "One mutation pass avoids cross-project races",
    );

    await page.goto("/en/settings");
    await expect
      .poll(async () =>
        (await page.context().cookies()).some((cookie) => cookie.name === "rada-session"),
      )
      .toBe(true);
    await page.reload();

    const control = page.getByLabel("Notifications");
    const initial = await control.inputValue();
    const changed = initial === "off" ? "important" : "off";

    const saveChanged = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/notification-preferences") &&
        response.request().method() === "POST",
    );
    await control.selectOption(changed);
    expect((await saveChanged).ok()).toBe(true);
    await page.reload();
    await expect(page.getByLabel("Notifications")).toHaveValue(changed);

    const saveRestored = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/notification-preferences") &&
        response.request().method() === "POST",
    );
    await page.getByLabel("Notifications").selectOption(initial);
    expect((await saveRestored).ok()).toBe(true);
    await page.reload();
    await expect(page.getByLabel("Notifications")).toHaveValue(initial);
  });
});

test("cookie-authenticated mutations reject missing CSRF proof", async ({ page }) => {
  await page.goto("/en");
  await expect
    .poll(async () =>
      (await page.context().cookies()).some((cookie) => cookie.name === "rada-session"),
    )
    .toBe(true);

  const result = await page.evaluate(async () => {
    const response = await fetch("/api/v1/follows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "athlete",
        targetId: "21000000-0000-4000-8000-000000000001",
      }),
    });
    return { status: response.status, body: await response.json() };
  });

  expect(result).toMatchObject({ status: 403, body: { error: { code: "csrf_failed" } } });
});
