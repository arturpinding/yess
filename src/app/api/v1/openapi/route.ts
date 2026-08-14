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
