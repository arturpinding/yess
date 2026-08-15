import { z } from "zod";

const iceUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .refine((value) => /^(?:stun|stuns|turn|turns):/i.test(value), {
    message: "ICE URLs must use stun:, stuns:, turn:, or turns:",
  });

const iceServerSchema = z
  .object({
    urls: z.union([iceUrlSchema, z.array(iceUrlSchema).min(1).max(8)]),
    username: z.string().max(512).optional(),
    credential: z.string().max(2_048).optional(),
  })
  .strict()
  .superRefine((server, context) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    const hasTurnUrl = urls.some((url) => /^turns?:/i.test(url));
    if (hasTurnUrl && (!server.username || !server.credential)) {
      context.addIssue({
        code: "custom",
        message: "TURN servers require both username and credential",
      });
    }
  });

const iceServersSchema = z.array(iceServerSchema).max(8);

export type DemoBroadcastIceServer = z.infer<typeof iceServerSchema>;

export function parseDemoBroadcastIceServers(
  rawValue: string | undefined,
): DemoBroadcastIceServer[] {
  const value = rawValue?.trim();
  if (!value) return [];
  if (value.length > 16_384) throw new Error("PHONE_BROADCAST_ICE_SERVERS_JSON is too large");

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("PHONE_BROADCAST_ICE_SERVERS_JSON must contain valid JSON");
  }

  const result = iceServersSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid PHONE_BROADCAST_ICE_SERVERS_JSON: ${result.error.issues[0]?.message}`);
  }
  return result.data;
}

export function getDemoBroadcastIceServers(): DemoBroadcastIceServer[] {
  return parseDemoBroadcastIceServers(process.env.PHONE_BROADCAST_ICE_SERVERS_JSON);
}

export function hasTurnServer(servers: readonly DemoBroadcastIceServer[]): boolean {
  return servers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => /^turns?:/i.test(url));
  });
}
