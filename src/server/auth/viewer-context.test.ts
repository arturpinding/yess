import { ANONYMOUS_PROFILE_ID, personalizationProfileId } from "./viewer-context";

describe("personalization profile isolation", () => {
  it("uses an empty reserved scope for anonymous requests", () => {
    expect(personalizationProfileId(null)).toBe(ANONYMOUS_PROFILE_ID);
  });

  it("uses only the profile resolved from the authenticated viewer", () => {
    expect(personalizationProfileId({ profileId: "profile-owned-by-session" })).toBe(
      "profile-owned-by-session",
    );
  });
});
