import type { NextConfig } from "next";

import { validatePhoneDemoHost } from "./src/dev/phone-demo-config";
import {
  getLiveKitConnectSources,
  isDemoBroadcastAvailable,
} from "./src/server/demo-broadcast/availability";

const isDevelopment = process.env.NODE_ENV !== "production";
const phoneBroadcastAvailable = isDemoBroadcastAvailable();
const liveKitConnectSources = getLiveKitConnectSources()
  .map((origin) => ` ${origin}`)
  .join("");
const localMediaSources = isDevelopment ? " http://127.0.0.1:8090 http://localhost:8090" : "";
const phoneDemoHost =
  isDevelopment && process.env.PHONE_DEMO_HOST?.trim()
    ? validatePhoneDemoHost(process.env.PHONE_DEMO_HOST)
    : undefined;

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `media-src 'self' blob: https://test-streams.mux.dev${localMediaSources}`,
  `connect-src 'self' https://test-streams.mux.dev${localMediaSources}${liveKitConnectSources}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  allowedDevOrigins: phoneDemoHost ? [phoneDemoHost] : [],
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          ...(!isDevelopment
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
      ...(phoneBroadcastAvailable
        ? [
            {
              source: "/:locale(et|en)/broadcast",
              headers: [
                {
                  key: "Permissions-Policy",
                  value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()",
                },
              ],
            },
          ]
        : []),
    ];
  },
};

export default nextConfig;
