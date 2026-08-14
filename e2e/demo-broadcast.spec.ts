import { devices, expect, test } from "@playwright/test";

test("phone publisher sends live camera media to one computer viewer and stop removes the room", async ({
  baseURL,
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "One real peer-to-peer pass is sufficient and avoids competing for the single viewer slot",
  );
  test.setTimeout(60_000);
  if (!baseURL) throw new Error("Playwright baseURL is required");

  const publisherContext = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL,
    permissions: ["camera", "microphone"],
    extraHTTPHeaders: { "x-real-ip": "198.51.100.77" },
  });
  const viewerContext = await browser.newContext({
    ...devices["Desktop Chrome"],
    baseURL,
    permissions: ["camera", "microphone"],
    extraHTTPHeaders: { "x-real-ip": "198.51.100.78" },
  });
  const publisher = await publisherContext.newPage();
  const viewer = await viewerContext.newPage();
  const afterStopViewer = await viewerContext.newPage();

  try {
    await publisher.goto("/en");
    await publisher
      .locator("header.top-bar")
      .getByRole("link", { name: "Broadcast", exact: true })
      .click();
    await expect(publisher).toHaveURL(/\/en\/broadcast$/);
    await expect(
      publisher.getByRole("heading", { name: "Share this phone's camera" }),
    ).toBeVisible();
    await publisher.getByRole("button", { name: "Allow camera and start" }).click();

    const displayedCode = publisher.getByTestId("publisher-code");
    await expect(displayedCode).toBeVisible({ timeout: 15_000 });
    const code = (await displayedCode.textContent())?.trim();
    expect(code).toMatch(/^[0-9A-HJ-KM-NP-TV-Z]{4}-[0-9A-HJ-KM-NP-TV-Z]{4}$/);
    if (!code) throw new Error("Publisher did not display a room code");

    await viewer.goto(`/en/broadcast/watch?code=${encodeURIComponent(code)}`);
    await viewer.getByRole("button", { name: "Join broadcast" }).click();

    await expect(publisher.getByTestId("publisher-connection-state")).toContainText(
      "Direct connection is live",
      { timeout: 20_000 },
    );
    await expect(viewer.getByTestId("viewer-connection-state")).toContainText(
      "Direct connection is live",
      { timeout: 20_000 },
    );

    const remoteVideo = viewer.getByTestId("remote-video");
    await expect
      .poll(
        async () =>
          remoteVideo.evaluate(
            (video: HTMLVideoElement) =>
              video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
              video.videoWidth > 0 &&
              video.videoHeight > 0 &&
              video.srcObject instanceof MediaStream &&
              video.srcObject.getTracks().some((track) => track.readyState === "live"),
          ),
        { timeout: 20_000 },
      )
      .toBe(true);

    const deletedRoom = publisher.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().endsWith(`/api/v1/demo-broadcasts/${code.replace("-", "")}`),
    );
    await publisher.getByRole("button", { name: "Stop broadcast" }).click();
    expect((await deletedRoom).status()).toBe(200);
    await expect(publisher.getByTestId("publisher-connection-state")).toContainText(
      "Broadcast stopped",
    );

    await afterStopViewer.goto(`/en/broadcast/watch?code=${encodeURIComponent(code)}`);
    await afterStopViewer.getByRole("button", { name: "Join broadcast" }).click();
    await expect(
      afterStopViewer.getByText("That code was not found or the session expired."),
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    await publisher
      .getByRole("button", { name: "Stop broadcast" })
      .click({ timeout: 1_000 })
      .catch(() => undefined);
    await afterStopViewer.close();
    await viewer.close();
    await viewerContext.close();
    await publisherContext.close();
  }
});
