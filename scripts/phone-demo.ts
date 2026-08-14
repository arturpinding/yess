import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  buildOpenSslPlan,
  parsePhoneDemoPort,
  selectPhoneDemoHost,
  type PhoneDemoCertificatePaths,
  type PhoneDemoNetworkAddress,
} from "../src/dev/phone-demo-config";

const CERTIFICATE_FORMAT_VERSION = 1;
const CERTIFICATE_DOWNLOAD_PATH = "/rada-phone-demo-ca.crt";
const CERTIFICATE_MINIMUM_REMAINING_SECONDS = 24 * 60 * 60;

type CertificateMetadata = {
  formatVersion: number;
  host: string;
};

type CertificateBundle = PhoneDemoCertificatePaths & {
  metadata: string;
};

function collectNetworkAddresses(): PhoneDemoNetworkAddress[] {
  return Object.entries(networkInterfaces()).flatMap(([interfaceName, addresses]) =>
    (addresses ?? [])
      .filter((address) => address.family === "IPv4")
      .map((address) => ({
        address: address.address,
        interfaceName,
        internal: address.internal,
      })),
  );
}

function certificateBundle(directory: string): CertificateBundle {
  return {
    caCertificate: join(directory, "rada-phone-demo-ca.crt"),
    caPrivateKey: join(directory, "rada-phone-demo-ca.key"),
    serverCertificate: join(directory, "rada-phone-demo-server.crt"),
    serverCertificateRequest: join(directory, "rada-phone-demo-server.csr"),
    serverExtensions: join(directory, "rada-phone-demo-server.ext"),
    serverPrivateKey: join(directory, "rada-phone-demo-server.key"),
    metadata: join(directory, "metadata.json"),
  };
}

function runCommand(
  command: string,
  args: readonly string[],
): Promise<{ stderr: string; stdout: string }> {
  return new Promise((resolveCommand, rejectCommand) => {
    execFile(
      command,
      [...args],
      { encoding: "utf8", timeout: 20_000, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.trim() || error.message;
          rejectCommand(new Error(`${command} failed: ${detail}`));
          return;
        }
        resolveCommand({ stderr, stdout });
      },
    );
  });
}

async function commandSucceeds(command: string, args: readonly string[]): Promise<boolean> {
  try {
    await runCommand(command, args);
    return true;
  } catch {
    return false;
  }
}

async function publicKeysMatch(certificatePath: string, privateKeyPath: string): Promise<boolean> {
  try {
    const [certificateKey, privateKey] = await Promise.all([
      runCommand("openssl", ["x509", "-in", certificatePath, "-pubkey", "-noout"]),
      runCommand("openssl", ["pkey", "-in", privateKeyPath, "-pubout"]),
    ]);
    return certificateKey.stdout.trim() === privateKey.stdout.trim();
  } catch {
    return false;
  }
}

async function certificatesAreReusable(host: string, paths: CertificateBundle): Promise<boolean> {
  try {
    const metadata = JSON.parse(await readFile(paths.metadata, "utf8")) as CertificateMetadata;
    if (metadata.formatVersion !== CERTIFICATE_FORMAT_VERSION || metadata.host !== host) {
      return false;
    }

    const checks = await Promise.all([
      commandSucceeds("openssl", [
        "verify",
        "-x509_strict",
        "-CAfile",
        paths.caCertificate,
        paths.caCertificate,
      ]),
      commandSucceeds("openssl", [
        "verify",
        "-x509_strict",
        "-purpose",
        "sslserver",
        "-CAfile",
        paths.caCertificate,
        paths.serverCertificate,
      ]),
      commandSucceeds("openssl", [
        "x509",
        "-checkend",
        String(CERTIFICATE_MINIMUM_REMAINING_SECONDS),
        "-noout",
        "-in",
        paths.caCertificate,
      ]),
      commandSucceeds("openssl", [
        "x509",
        "-checkend",
        String(CERTIFICATE_MINIMUM_REMAINING_SECONDS),
        "-noout",
        "-in",
        paths.serverCertificate,
      ]),
      commandSucceeds("openssl", [
        "x509",
        "-in",
        paths.serverCertificate,
        "-noout",
        "-checkip",
        host,
      ]),
      commandSucceeds("openssl", [
        "x509",
        "-in",
        paths.serverCertificate,
        "-noout",
        "-checkhost",
        "localhost",
      ]),
      publicKeysMatch(paths.caCertificate, paths.caPrivateKey),
      publicKeysMatch(paths.serverCertificate, paths.serverPrivateKey),
    ]);

    return checks.every(Boolean);
  } catch {
    return false;
  }
}

async function enforceCertificateModes(paths: CertificateBundle): Promise<void> {
  await Promise.all([
    chmod(paths.caPrivateKey, 0o600),
    chmod(paths.serverPrivateKey, 0o600),
    chmod(paths.caCertificate, 0o644),
    chmod(paths.serverCertificate, 0o644),
    chmod(paths.serverCertificateRequest, 0o600),
    chmod(paths.serverExtensions, 0o600),
    chmod(paths.metadata, 0o600),
  ]);
}

async function generateCertificates(
  host: string,
  rootDirectory: string,
  destination: CertificateBundle,
): Promise<void> {
  const temporaryDirectory = await mkdtemp(join(rootDirectory, ".building-"));
  const temporary = certificateBundle(temporaryDirectory);
  const serial = randomBytes(16).toString("hex");
  const plan = buildOpenSslPlan(host, temporary, serial);

  try {
    await writeFile(temporary.serverExtensions, plan.serverExtensions, { mode: 0o600 });
    for (const invocation of plan.invocations) {
      await runCommand(invocation.command, invocation.args);
    }

    const metadata: CertificateMetadata = {
      formatVersion: CERTIFICATE_FORMAT_VERSION,
      host,
    };
    await writeFile(temporary.metadata, `${JSON.stringify(metadata, null, 2)}\n`, {
      mode: 0o600,
    });

    await mkdir(dirname(destination.caCertificate), { mode: 0o700, recursive: true });
    for (const key of [
      "caCertificate",
      "caPrivateKey",
      "serverCertificate",
      "serverCertificateRequest",
      "serverExtensions",
      "serverPrivateKey",
      "metadata",
    ] as const) {
      await copyFile(temporary[key], destination[key]);
    }
    await enforceCertificateModes(destination);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

async function ensureCertificates(host: string): Promise<CertificateBundle> {
  await runCommand("openssl", ["version"]);

  const rootDirectory = resolve(process.cwd(), ".local-certificates");
  const hostDirectory = join(rootDirectory, host);
  const lockPath = join(rootDirectory, ".generation.lock");
  await mkdir(rootDirectory, { mode: 0o700, recursive: true });
  await chmod(rootDirectory, 0o700);
  await mkdir(hostDirectory, { mode: 0o700, recursive: true });
  await chmod(hostDirectory, 0o700);

  let lock: Awaited<ReturnType<typeof open>>;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        `Certificate generation is already locked at ${lockPath}. Stop the other phone demo or remove this lock only after confirming no launcher is running.`,
      );
    }
    throw error;
  }

  const paths = certificateBundle(hostDirectory);
  try {
    if (!(await certificatesAreReusable(host, paths))) {
      console.info("Generating a short-lived development CA and HTTPS certificate...");
      await generateCertificates(host, rootDirectory, paths);
    } else {
      await enforceCertificateModes(paths);
      console.info("Reusing the valid host-matched development certificate.");
    }
  } finally {
    await lock.close();
    await unlink(lockPath).catch(() => undefined);
  }

  return paths;
}

function sendPlainResponse(
  response: ServerResponse,
  statusCode: number,
  body: string | Buffer,
  contentType: string,
  method: string | undefined,
  extraHeaders: Record<string, string> = {},
): void {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": String(Buffer.byteLength(body)),
    "Content-Security-Policy": "default-src 'none'",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  response.end(method === "HEAD" ? undefined : body);
}

async function startCertificateServer(
  host: string,
  port: number,
  certificatePath: string,
): Promise<Server> {
  const publicCertificate = await readFile(certificatePath);
  const server = createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendPlainResponse(
        response,
        405,
        "Method not allowed\n",
        "text/plain; charset=utf-8",
        request.method,
        { Allow: "GET, HEAD" },
      );
      return;
    }

    let requestUrl: URL;
    try {
      requestUrl = new URL(request.url ?? "", `http://${host}:${port}`);
    } catch {
      sendPlainResponse(
        response,
        400,
        "Bad request\n",
        "text/plain; charset=utf-8",
        request.method,
      );
      return;
    }

    if (requestUrl.search !== "") {
      sendPlainResponse(response, 404, "Not found\n", "text/plain; charset=utf-8", request.method);
      return;
    }

    if (requestUrl.pathname === CERTIFICATE_DOWNLOAD_PATH) {
      sendPlainResponse(
        response,
        200,
        publicCertificate,
        "application/x-x509-ca-cert",
        request.method,
        { "Content-Disposition": 'attachment; filename="rada-phone-demo-ca.crt"' },
      );
      return;
    }

    if (requestUrl.pathname === "/health") {
      sendPlainResponse(
        response,
        200,
        `${JSON.stringify({ status: "ok", service: "rada-phone-demo-ca" })}\n`,
        "application/json; charset=utf-8",
        request.method,
      );
      return;
    }

    sendPlainResponse(response, 404, "Not found\n", "text/plain; charset=utf-8", request.method);
  });

  server.maxHeadersCount = 32;
  server.headersTimeout = 5_000;
  server.requestTimeout = 5_000;
  server.keepAliveTimeout = 5_000;

  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error): void => rejectListen(error);
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolveListen();
    });
  });
  return server;
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
}

function waitForChild(
  child: ChildProcess,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolveChild, rejectChild) => {
    child.once("error", rejectChild);
    child.once("exit", (code, signal) => resolveChild({ code, signal }));
  });
}

async function main(): Promise<void> {
  const host = selectPhoneDemoHost(collectNetworkAddresses(), process.env.PHONE_DEMO_HOST);
  const applicationPort = parsePhoneDemoPort(process.env.PHONE_DEMO_PORT, 3000, "PHONE_DEMO_PORT");
  const certificatePort = parsePhoneDemoPort(
    process.env.PHONE_DEMO_CA_PORT,
    3080,
    "PHONE_DEMO_CA_PORT",
  );
  if (applicationPort === certificatePort) {
    throw new Error("PHONE_DEMO_PORT and PHONE_DEMO_CA_PORT must be different");
  }

  const certificates = await ensureCertificates(host);
  const fingerprintResult = await runCommand("openssl", [
    "x509",
    "-in",
    certificates.caCertificate,
    "-noout",
    "-fingerprint",
    "-sha256",
  ]);
  const fingerprint = fingerprintResult.stdout.trim().replace(/^sha256 Fingerprint=/i, "");
  const certificateServer = await startCertificateServer(
    host,
    certificatePort,
    certificates.caCertificate,
  );

  const origin = `https://${host}:${applicationPort}`;
  const certificateUrl = `http://${host}:${certificatePort}${CERTIFICATE_DOWNLOAD_PATH}`;
  console.info("\nRADA phone-camera demo");
  console.info(`  Phone broadcaster:  ${origin}/et/broadcast`);
  console.info(`  Computer viewer:    ${origin}/et/broadcast/watch`);
  console.info(`  Public CA download: ${certificateUrl}`);
  console.info(`  CA SHA-256:          ${fingerprint}`);
  console.info("\nOn Android, install the downloaded file as a CA certificate only for this demo.");
  console.info(
    "Android will warn that network traffic may be monitored; remove the RADA Phone Demo CA afterward.",
  );
  console.info(
    `Both devices must use the same HTTPS LAN origin. Keep TCP ports ${applicationPort} and ${certificatePort} reachable on trusted Wi-Fi.\n`,
  );

  const nextBinary = resolve(process.cwd(), "node_modules/next/dist/bin/next");
  const child = spawn(
    process.execPath,
    [
      nextBinary,
      "dev",
      "--hostname",
      "0.0.0.0",
      "--port",
      String(applicationPort),
      "--experimental-https",
      "--experimental-https-key",
      certificates.serverPrivateKey,
      "--experimental-https-cert",
      certificates.serverCertificate,
      "--experimental-https-ca",
      certificates.caCertificate,
    ],
    {
      env: {
        ...process.env,
        APP_ORIGIN: origin,
        NODE_ENV: "development",
        PHONE_DEMO_HOST: host,
      },
      stdio: "inherit",
    },
  );

  let stopping = false;
  const stopChild = (signal: NodeJS.Signals): void => {
    if (stopping) {
      return;
    }
    stopping = true;
    console.info(`\nStopping phone demo (${signal})...`);
    certificateServer.close();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
      const forceTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, 10_000);
      forceTimer.unref();
    }
  };
  const onSigint = (): void => stopChild("SIGINT");
  const onSigterm = (): void => stopChild("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  try {
    const result = await waitForChild(child);
    if (result.code !== null) {
      process.exitCode = result.code;
    } else if (result.signal) {
      process.exitCode = result.signal === "SIGINT" ? 130 : 143;
    }
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    await closeServer(certificateServer).catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Phone demo failed: ${message}`);
  process.exitCode = 1;
});
