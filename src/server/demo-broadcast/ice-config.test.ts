import { describe, expect, it } from "vitest";
import { hasTurnServer, parseDemoBroadcastIceServers } from "./ice-config";

describe("phone broadcast ICE configuration", () => {
  it("defaults to host candidates for the local LAN demo", () => {
    expect(parseDemoBroadcastIceServers(undefined)).toEqual([]);
  });

  it("accepts bounded STUN and authenticated TURN entries", () => {
    const servers = parseDemoBroadcastIceServers(
      JSON.stringify([
        { urls: "stun:stun.example.test:3478" },
        {
          urls: ["turn:turn.example.test:3478?transport=udp", "turns:turn.example.test:443"],
          username: "ephemeral-user",
          credential: "ephemeral-credential",
        },
      ]),
    );

    expect(servers).toHaveLength(2);
    expect(hasTurnServer(servers)).toBe(true);
  });

  it("rejects malformed JSON, web URLs, and unauthenticated TURN", () => {
    expect(() => parseDemoBroadcastIceServers("not-json")).toThrow("valid JSON");
    expect(() => parseDemoBroadcastIceServers('[{"urls":"https://example.test"}]')).toThrow(
      "ICE URLs",
    );
    expect(() => parseDemoBroadcastIceServers('[{"urls":"turn:example.test:3478"}]')).toThrow(
      "require both username and credential",
    );
  });
});
