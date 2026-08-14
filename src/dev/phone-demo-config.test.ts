import {
  buildOpenSslPlan,
  isPrivateIpv4,
  parsePhoneDemoPort,
  selectPhoneDemoHost,
  validatePhoneDemoHost,
  type PhoneDemoCertificatePaths,
} from "./phone-demo-config";

const certificatePaths: PhoneDemoCertificatePaths = {
  caCertificate: "/safe/ca.crt",
  caPrivateKey: "/safe/ca.key",
  serverCertificate: "/safe/server.crt",
  serverCertificateRequest: "/safe/server.csr",
  serverExtensions: "/safe/server.ext",
  serverPrivateKey: "/safe/server.key",
};

describe("phone demo network configuration", () => {
  test.each(["10.0.0.8", "172.16.1.2", "172.31.255.254", "192.168.50.9"])(
    "accepts private address %s",
    (address) => expect(isPrivateIpv4(address)).toBe(true),
  );

  test.each(["127.0.0.1", "172.32.0.1", "192.0.2.1", "0.0.0.0", "example.test"])(
    "rejects non-private host %s",
    (address) => expect(isPrivateIpv4(address)).toBe(false),
  );

  it("prefers a physical interface over a virtual bridge", () => {
    expect(
      selectPhoneDemoHost([
        { interfaceName: "docker0", address: "172.17.0.1", internal: false },
        { interfaceName: "wlan0", address: "192.168.1.42", internal: false },
      ]),
    ).toBe("192.168.1.42");
  });

  it("requires an override to be private and assigned locally", () => {
    const addresses = [{ interfaceName: "wlan0", address: "192.168.1.42", internal: false }];
    expect(selectPhoneDemoHost(addresses, " 192.168.1.42 ")).toBe("192.168.1.42");
    expect(() => selectPhoneDemoHost(addresses, "192.168.1.90")).toThrow("not assigned");
    expect(() => validatePhoneDemoHost("127.0.0.1")).toThrow("private, non-loopback");
  });

  it("validates non-privileged ports", () => {
    expect(parsePhoneDemoPort(undefined, 3000, "PHONE_DEMO_PORT")).toBe(3000);
    expect(parsePhoneDemoPort(" 3080 ", 3000, "PHONE_DEMO_PORT")).toBe(3080);
    expect(() => parsePhoneDemoPort("443", 3000, "PHONE_DEMO_PORT")).toThrow("1024 and 65535");
    expect(() => parsePhoneDemoPort("3000;echo", 3000, "PHONE_DEMO_PORT")).toThrow(
      "1024 and 65535",
    );
  });
});

describe("phone demo OpenSSL plan", () => {
  it("uses argument arrays and creates a constrained CA and IP/localhost server certificate", () => {
    const plan = buildOpenSslPlan(
      "192.168.1.42",
      certificatePaths,
      "0123456789abcdef0123456789abcdef",
    );

    expect(plan.invocations).toHaveLength(5);
    expect(plan.invocations.every(({ command }) => command === "openssl")).toBe(true);
    expect(plan.invocations.flatMap(({ args }) => args)).not.toContain("-c");
    expect(plan.invocations.flatMap(({ args }) => args)).toContain(
      "basicConstraints=critical,CA:TRUE,pathlen:0",
    );
    expect(plan.invocations.flatMap(({ args }) => args)).toContain(
      "keyUsage=critical,keyCertSign,cRLSign",
    );
    expect(plan.serverExtensions).toContain("basicConstraints=critical,CA:FALSE");
    expect(plan.serverExtensions).toContain("extendedKeyUsage=serverAuth");
    expect(plan.serverExtensions).toContain(
      "subjectAltName=IP:192.168.1.42,DNS:localhost,IP:127.0.0.1",
    );
  });

  it("rejects unsafe certificate inputs before constructing arguments", () => {
    expect(() =>
      buildOpenSslPlan("192.168.1.42;touch /tmp/unsafe", certificatePaths, "0123456789abcdef"),
    ).toThrow("private, non-loopback");
    expect(() => buildOpenSslPlan("192.168.1.42", certificatePaths, "not-hex")).toThrow(
      "Certificate serial",
    );
  });
});
