import { checkCsrfProtection } from "./csrf";

describe("CSRF protection", () => {
  it("requires exact trusted origin and double-submit token for cookie mutations", () => {
    expect(
      checkCsrfProtection({
        method: "POST",
        authenticationMode: "cookie",
        originHeader: "https://rada.test",
        allowedOrigins: ["https://rada.test"],
        csrfCookieToken: "random-token",
        csrfHeaderToken: "random-token",
      }),
    ).toEqual({ allowed: true });
    expect(
      checkCsrfProtection({
        method: "POST",
        authenticationMode: "cookie",
        originHeader: "https://attacker.test",
        allowedOrigins: ["https://rada.test"],
        csrfCookieToken: "random-token",
        csrfHeaderToken: "random-token",
      }),
    ).toEqual({ allowed: false, reason: "untrusted-origin" });
  });

  it("does not apply CSRF checks to safe methods or bearer authentication", () => {
    expect(
      checkCsrfProtection({ method: "GET", authenticationMode: "cookie", allowedOrigins: [] }),
    ).toEqual({ allowed: true });
    expect(
      checkCsrfProtection({ method: "POST", authenticationMode: "bearer", allowedOrigins: [] }),
    ).toEqual({ allowed: true });
  });
});
