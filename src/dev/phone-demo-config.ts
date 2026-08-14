import { isIPv4 } from "node:net";

export type PhoneDemoNetworkAddress = {
  address: string;
  interfaceName: string;
  internal: boolean;
};

export type PhoneDemoCertificatePaths = {
  caCertificate: string;
  caPrivateKey: string;
  serverCertificate: string;
  serverCertificateRequest: string;
  serverExtensions: string;
  serverPrivateKey: string;
};

export type OpenSslInvocation = {
  command: "openssl";
  args: string[];
};

const virtualInterfacePattern = /^(?:br-|docker|veth|virbr|vmnet|vboxnet|tailscale|tun|tap|wg)/i;

export function isPrivateIpv4(address: string): boolean {
  if (!isIPv4(address)) {
    return false;
  }

  const [first = -1, second = -1] = address.split(".").map(Number);

  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export function validatePhoneDemoHost(rawHost: string): string {
  const host = rawHost.trim();

  if (!isPrivateIpv4(host)) {
    throw new Error(
      `PHONE_DEMO_HOST must be a private, non-loopback IPv4 address; received ${JSON.stringify(rawHost)}`,
    );
  }

  return host;
}

export function selectPhoneDemoHost(
  addresses: readonly PhoneDemoNetworkAddress[],
  rawOverride?: string,
): string {
  const eligible = addresses.filter(
    (candidate) => !candidate.internal && isPrivateIpv4(candidate.address),
  );

  if (rawOverride !== undefined && rawOverride.trim() !== "") {
    const override = validatePhoneDemoHost(rawOverride);
    if (!eligible.some((candidate) => candidate.address === override)) {
      const available = eligible.map((candidate) => candidate.address).join(", ") || "none";
      throw new Error(
        `PHONE_DEMO_HOST ${override} is not assigned to an active private interface (available: ${available})`,
      );
    }
    return override;
  }

  const selected = [...eligible].sort((left, right) => {
    const leftVirtual = virtualInterfacePattern.test(left.interfaceName) ? 1 : 0;
    const rightVirtual = virtualInterfacePattern.test(right.interfaceName) ? 1 : 0;
    return (
      leftVirtual - rightVirtual ||
      left.interfaceName.localeCompare(right.interfaceName) ||
      left.address.localeCompare(right.address)
    );
  })[0];

  if (!selected) {
    throw new Error(
      "No active private IPv4 interface was found. Connect to Wi-Fi/Ethernet or set PHONE_DEMO_HOST to an assigned RFC1918 address.",
    );
  }

  return selected.address;
}

export function parsePhoneDemoPort(
  rawPort: string | undefined,
  fallback: number,
  variableName: string,
): number {
  const normalized = rawPort?.trim();
  if (!normalized) {
    return fallback;
  }

  if (!/^\d{1,5}$/.test(normalized)) {
    throw new Error(`${variableName} must be an integer between 1024 and 65535`);
  }

  const port = Number(normalized);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`${variableName} must be an integer between 1024 and 65535`);
  }

  return port;
}

export function buildOpenSslPlan(
  host: string,
  paths: PhoneDemoCertificatePaths,
  serialHex: string,
): { invocations: OpenSslInvocation[]; serverExtensions: string } {
  const validatedHost = validatePhoneDemoHost(host);
  if (!/^[a-f\d]{16,64}$/i.test(serialHex)) {
    throw new Error("Certificate serial must be 16-64 hexadecimal characters");
  }

  const serverExtensions = [
    "basicConstraints=critical,CA:FALSE",
    "keyUsage=critical,digitalSignature,keyEncipherment",
    "extendedKeyUsage=serverAuth",
    `subjectAltName=IP:${validatedHost},DNS:localhost,IP:127.0.0.1`,
    "authorityKeyIdentifier=keyid,issuer",
    "subjectKeyIdentifier=hash",
    "",
  ].join("\n");

  return {
    serverExtensions,
    invocations: [
      {
        command: "openssl",
        args: [
          "genpkey",
          "-algorithm",
          "RSA",
          "-pkeyopt",
          "rsa_keygen_bits:3072",
          "-out",
          paths.caPrivateKey,
        ],
      },
      {
        command: "openssl",
        args: [
          "req",
          "-x509",
          "-new",
          "-sha256",
          "-key",
          paths.caPrivateKey,
          "-out",
          paths.caCertificate,
          "-days",
          "14",
          "-subj",
          `/CN=RADA Phone Demo CA ${validatedHost}`,
          "-addext",
          "basicConstraints=critical,CA:TRUE,pathlen:0",
          "-addext",
          "keyUsage=critical,keyCertSign,cRLSign",
          "-addext",
          "subjectKeyIdentifier=hash",
        ],
      },
      {
        command: "openssl",
        args: [
          "genpkey",
          "-algorithm",
          "RSA",
          "-pkeyopt",
          "rsa_keygen_bits:2048",
          "-out",
          paths.serverPrivateKey,
        ],
      },
      {
        command: "openssl",
        args: [
          "req",
          "-new",
          "-sha256",
          "-key",
          paths.serverPrivateKey,
          "-out",
          paths.serverCertificateRequest,
          "-subj",
          "/CN=localhost",
        ],
      },
      {
        command: "openssl",
        args: [
          "x509",
          "-req",
          "-sha256",
          "-in",
          paths.serverCertificateRequest,
          "-CA",
          paths.caCertificate,
          "-CAkey",
          paths.caPrivateKey,
          "-set_serial",
          `0x${serialHex}`,
          "-out",
          paths.serverCertificate,
          "-days",
          "3",
          "-extfile",
          paths.serverExtensions,
        ],
      },
    ],
  };
}
