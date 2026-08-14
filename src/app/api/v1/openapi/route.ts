import { NextResponse } from "next/server";

const errorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code"],
      properties: { code: { type: "string" } },
    },
  },
} as const;

const document = {
  openapi: "3.1.0",
  info: {
    title: "RADA web API",
    version: "0.1.0",
    description:
      "Browser-facing development API. Cookie-authenticated mutations require Origin and X-CSRF-Token.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/api/health/live": {
      get: { summary: "Process liveness", responses: { "200": { description: "Live" } } },
    },
    "/api/health/ready": {
      get: {
        summary: "Environment and database readiness",
        responses: { "200": { description: "Ready" }, "503": { description: "Not ready" } },
      },
    },
    "/api/v1/session/demo": {
      post: {
        summary: "Create a local demo session",
        responses: {
          "201": { description: "Session created" },
          "404": { description: "Disabled in production" },
        },
      },
    },
    "/api/v1/follows": {
      post: {
        summary: "Follow an athlete, team, sport, or competition",
        responses: {
          "200": { description: "Following" },
          "401": { description: "Authentication required" },
        },
      },
      delete: {
        summary: "Unfollow a target",
        responses: { "200": { description: "Not following" } },
      },
    },
    "/api/v1/notification-preferences": {
      post: {
        summary: "Upsert in-app notification categories",
        responses: { "200": { description: "Preferences saved" } },
      },
    },
    "/api/v1/notifications/read": {
      post: {
        summary: "Mark this profile's inbox read",
        responses: { "200": { description: "Inbox updated" } },
      },
    },
    "/api/v1/notifications/{notificationId}/read": {
      post: {
        summary: "Mark one notification read",
        parameters: [
          {
            name: "notificationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": { description: "Notification updated" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/v1/events/{eventId}/playback-authorizations": {
      post: {
        summary: "Resolve rights and create a short-lived playback lease",
        parameters: [
          {
            name: "eventId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "201": { description: "Internal playback authorized" },
          "200": { description: "External destination resolved" },
          "403": { description: "Rights denied" },
        },
      },
    },
    "/api/v1/playback-telemetry": {
      post: {
        summary: "Submit allow-listed operational player telemetry",
        responses: { "202": { description: "Accepted" } },
      },
    },
    "/api/v1/calendar.ics": {
      get: {
        summary: "Export the current profile's followed-event calendar",
        responses: { "200": { description: "iCalendar" } },
      },
    },
    "/api/v1/admin/events/{eventId}": {
      patch: {
        summary: "Correct event metadata and lifecycle state",
        description: "Development only; production returns 404.",
        parameters: [
          {
            name: "eventId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": { description: "Event updated and audited" },
          "404": { description: "Unavailable in production or event not found" },
          "409": { description: "Version, schedule, or lifecycle conflict" },
        },
      },
    },
    "/api/v1/admin/streams": {
      post: {
        summary: "Create a development playback source",
        description: "Development only; production returns 404.",
        responses: {
          "201": { description: "Source created and audited" },
          "404": { description: "Unavailable in production" },
          "409": { description: "Provider reference conflict" },
        },
      },
    },
    "/api/v1/admin/streams/{streamId}": {
      patch: {
        summary: "Update playback-source metadata",
        description: "Development only; production returns 404.",
        parameters: [
          {
            name: "streamId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": { description: "Source updated and audited" },
          "409": { description: "Optimistic-concurrency conflict" },
        },
      },
      delete: {
        summary: "Delete an inactive demo source",
        description: "Development only; active playback and production sources are protected.",
        responses: {
          "200": { description: "Source deleted with cascade counts" },
          "409": { description: "Source is active or version is stale" },
        },
      },
    },
    "/api/v1/admin/streams/{streamId}/operations": {
      post: {
        summary: "Operate an allow-listed media provider resource",
        description:
          "Development only. Requires Idempotency-Key, CSRF proof, expectedUpdatedAt and a reason.",
        parameters: [
          {
            name: "streamId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "Idempotency-Key",
            in: "header",
            required: true,
            schema: { type: "string", minLength: 8, maxLength: 180 },
          },
        ],
        responses: {
          "200": { description: "Provider result and desired/observed state recorded" },
          "409": { description: "Transition, idempotency, pending-operation, or version conflict" },
          "422": { description: "Provider or protocol is not configured" },
          "502": { description: "Provider unavailable or invalid response" },
        },
      },
    },
    "/api/v1/admin/rights-windows": {
      post: {
        summary: "Create a technical viewing-rights policy window",
        description: "Development only; this record is not a legal rights contract.",
        responses: {
          "201": { description: "Rights window created and audited" },
          "409": { description: "Equal-rank overlapping policy conflict" },
        },
      },
    },
    "/api/v1/admin/rights-windows/{rightsWindowId}": {
      patch: {
        summary: "Update or emergency-disable a rights window",
        description:
          "Development only. Setting access to unavailable immediately denies new authorizations.",
        parameters: [
          {
            name: "rightsWindowId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": { description: "Rights window updated and audited" },
          "409": { description: "Version or overlap conflict" },
        },
      },
      delete: {
        summary: "Delete an inactive rights window on demo content",
        description: "Development only; active policies and non-demo targets cannot be deleted.",
        responses: {
          "200": { description: "Rights window deleted and audited" },
          "403": { description: "Demo target required" },
          "409": { description: "Active policy or stale version" },
        },
      },
    },
  },
  components: { schemas: { Error: errorSchema } },
} as const;

export async function GET() {
  return NextResponse.json(document, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
