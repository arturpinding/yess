"use client";

import { Bell, BellOff } from "lucide-react";
import { useState, useTransition } from "react";
import {
  IMPORTANT_NOTIFICATION_KINDS,
  NOTIFICATION_KINDS,
  type NotificationMode,
  type NotificationTargetType,
} from "@/domain/notification-preferences";
import type { Dictionary } from "@/i18n/dictionaries";
import { mutationHeaders } from "./client-security";

export function NotificationControl({
  targetId,
  targetType,
  dictionary: d,
  initialMode = "important",
}: {
  targetId?: string;
  targetType: "global" | NotificationTargetType;
  dictionary: Dictionary;
  initialMode?: NotificationMode;
}) {
  const [mode, setMode] = useState(initialMode);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <label className="notification-control">
      <span className="sr-only">{d.notifications}</span>
      {mode === "off" ? (
        <BellOff size={15} aria-hidden="true" />
      ) : (
        <Bell size={15} aria-hidden="true" />
      )}
      <select
        value={mode}
        disabled={pending}
        onChange={(event) => {
          const previous = mode;
          const next = event.target.value as NotificationMode;
          setMode(next);
          setFailed(false);
          startTransition(async () => {
            try {
              const response = await fetch("/api/v1/notification-preferences", {
                method: "POST",
                headers: mutationHeaders(),
                body: JSON.stringify({
                  ...(targetId ? { targetId } : {}),
                  targetType,
                  enabled: next !== "off",
                  leadMinutes: 15,
                  categories:
                    next === "important" ? IMPORTANT_NOTIFICATION_KINDS : NOTIFICATION_KINDS,
                }),
              });
              if (!response.ok) throw new Error("preference_failed");
            } catch {
              setMode(previous);
              setFailed(true);
            }
          });
        }}
      >
        <option value="all">{d.notifyAll}</option>
        <option value="important">{d.notifyImportant}</option>
        <option value="off">{d.notifyOff}</option>
      </select>
      {failed && (
        <span className="sr-only" role="alert">
          {d.errorTitle}
        </span>
      )}
    </label>
  );
}
