/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AdminProduct, AdminRightsTargetGroups, AdminRightsWindow } from "./admin-api";
import { AdminRightsPanel } from "./admin-rights-panel";

const eventId = "20000000-0000-4000-8000-000000000001";
const rightsId = "30000000-0000-4000-8000-000000000001";
const target = {
  type: "event" as const,
  id: eventId,
  label: { et: "Näidisfinaal", en: "Demo final" },
  eventId,
};
const groups: AdminRightsTargetGroups = {
  competitions: [],
  events: [target],
  streams: [],
  mediaAssets: [],
};
const products: AdminProduct[] = [
  {
    id: "40000000-0000-4000-8000-000000000001",
    code: "RADA-MONTHLY",
    label: { et: "RADA kuu", en: "RADA monthly" },
  },
];
const right: AdminRightsWindow = {
  id: rightsId,
  target,
  contentKind: "live",
  countryCode: "EE",
  access: "free",
  requiredProductId: null,
  startsAt: "2026-08-14T12:00:00.000Z",
  endsAt: "2027-08-14T16:00:00.000Z",
  dvrAllowed: false,
  recordingAllowed: false,
  maxConcurrentStreams: 2,
  externalWatchUrl: null,
  rightsHolder: "Demo Rights OÜ",
  contractReference: "DEMO-2026-001",
  priority: 200,
  createdAt: "2026-08-14T10:00:00.000Z",
  updatedAt: "2026-08-14T10:00:00.000Z",
};

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AdminRightsPanel", () => {
  beforeEach(() => {
    document.cookie = "rada-csrf=rights-panel-csrf-token-that-is-long-enough; Path=/";
  });

  afterEach(() => vi.unstubAllGlobals());

  it("creates a complete event rights window with UTC instants", async () => {
    const onChanged = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ data: right, requestId: "rights-create" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AdminRightsPanel
        locale="en"
        initialRights={[]}
        rightsTargets={groups}
        products={products}
        onChanged={onChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add rights window" }));
    const form = screen.getByRole("button", { name: "Create rights window" }).closest("form");
    if (!form) throw new Error("rights create form missing");
    fireEvent.change(within(form).getByLabelText("Starts"), {
      target: { value: "2026-08-15T15:00" },
    });
    fireEvent.change(within(form).getByLabelText("Ends"), {
      target: { value: "2026-08-15T19:00" },
    });
    fireEvent.change(within(form).getByLabelText("Rights holder"), {
      target: { value: right.rightsHolder },
    });
    fireEvent.change(within(form).getByLabelText("Reason for change"), {
      target: { value: "Publish the approved demo contract" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Create rights window" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/v1/admin/rights-windows");
    expect(JSON.parse(String(init.body))).toMatchObject({
      target: { type: "event", id: eventId },
      contentKind: "live",
      countryCode: "EE",
      access: "free",
      startsAt: "2026-08-15T12:00:00.000Z",
      endsAt: "2026-08-15T16:00:00.000Z",
      rightsHolder: right.rightsHolder,
      priority: 100,
      reason: "Publish the approved demo contract",
    });
    expect(onChanged).toHaveBeenCalledWith("Rights window created.");
  });

  it("requires confirmation and sends an access-only emergency takedown", async () => {
    const unavailable: AdminRightsWindow = {
      ...right,
      access: "unavailable",
      maxConcurrentStreams: null,
      updatedAt: "2026-08-14T10:01:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ data: unavailable, requestId: "rights-stop" }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AdminRightsPanel
        locale="en"
        initialRights={[right]}
        rightsTargets={groups}
        products={products}
      />,
    );

    const summaryLabel = screen
      .getAllByText("Demo final")
      .find((element) => element.tagName === "STRONG");
    if (!summaryLabel) throw new Error("rights summary label missing");
    const record = summaryLabel.closest("details");
    if (!record) throw new Error("rights editor missing");
    fireEvent.click(summaryLabel);
    fireEvent.change(within(record).getByLabelText("Reason for change"), {
      target: { value: "Emergency legal takedown" },
    });
    fireEvent.click(within(record).getByRole("button", { name: "Stop access now" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "Stop access under this policy?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Stop access" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe(`/api/v1/admin/rights-windows/${rightsId}`);
    expect(JSON.parse(String(init.body))).toEqual({
      access: "unavailable",
      reason: "Emergency legal takedown",
      expectedUpdatedAt: right.updatedAt,
    });
    expect(
      (await screen.findAllByText("Unavailable")).some(
        (element) => element.tagName === "SPAN" && element.className.includes("unavailable"),
      ),
    ).toBe(true);
  });

  it("shows a recoverable overlap conflict", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response(
            { error: { code: "overlapping_policy_conflict" }, requestId: "rights-conflict" },
            409,
          ),
        ),
    );
    render(
      <AdminRightsPanel
        locale="en"
        initialRights={[]}
        rightsTargets={groups}
        products={products}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add rights window" }));
    const form = screen.getByRole("button", { name: "Create rights window" }).closest("form");
    if (!form) throw new Error("rights create form missing");
    fireEvent.change(within(form).getByLabelText("Rights holder"), {
      target: { value: "Conflicting Holder" },
    });
    fireEvent.change(within(form).getByLabelText("Reason for change"), {
      target: { value: "Test overlapping policy" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Create rights window" }));

    expect(
      await screen.findByText(/same scope, content, territory, time overlap, and priority/),
    ).toBeVisible();
  });
});
