import {
  isBroadcastCapturePath,
  requiresCameraPolicyDocumentNavigation,
} from "./navigation-boundary";

describe("camera Permissions-Policy navigation boundary", () => {
  it("recognizes only the exact Estonian and English capture documents", () => {
    expect(isBroadcastCapturePath("/et/broadcast")).toBe(true);
    expect(isBroadcastCapturePath("/en/broadcast/")).toBe(true);
    expect(isBroadcastCapturePath("/et/broadcast?source=shell#start")).toBe(true);

    expect(isBroadcastCapturePath("/et/broadcast/watch")).toBe(false);
    expect(isBroadcastCapturePath("/et/broadcasting")).toBe(false);
    expect(isBroadcastCapturePath("/fi/broadcast")).toBe(false);
  });

  it("requires a document navigation when entering or leaving capture permission", () => {
    expect(requiresCameraPolicyDocumentNavigation("/et", "/et/broadcast")).toBe(true);
    expect(requiresCameraPolicyDocumentNavigation("/et/broadcast", "/et/schedule")).toBe(true);
    expect(requiresCameraPolicyDocumentNavigation("/et/broadcast", "/en/broadcast")).toBe(true);
  });

  it("keeps client transitions between documents with the same denied policy", () => {
    expect(requiresCameraPolicyDocumentNavigation("/et", "/et/schedule")).toBe(false);
    expect(requiresCameraPolicyDocumentNavigation("/et/broadcast/watch", "/et/discover")).toBe(
      false,
    );
  });
});
