/** @vitest-environment jsdom */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { AthletePortrait } from "./athlete-portrait";

describe("AthletePortrait", () => {
  it("renders an accessible local portrait and falls back to labelled initials on error", () => {
    const alt = "Synthetic demo portrait: Mari Mets";

    render(
      <AthletePortrait
        initials="MM"
        portraitUrl="/athletes/demo/mari-mets.svg"
        demoLabel="Demo data"
        portraitAlt={alt}
      />,
    );

    const portrait = screen.getByRole("img", { name: alt });
    expect(new URL(portrait.getAttribute("src") ?? "", window.location.origin).pathname).toBe(
      "/athletes/demo/mari-mets.svg",
    );
    expect(screen.getByText("Demo data")).toBeVisible();

    fireEvent.error(portrait);

    const fallback = screen.getByRole("img", { name: alt });
    expect(fallback.tagName).toBe("SPAN");
    expect(within(fallback).getByText("MM")).toHaveAttribute("aria-hidden", "true");
  });
});
