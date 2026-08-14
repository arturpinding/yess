"use client";

import { CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { mutationHeaders } from "./client-security";

export function MarkNotificationsRead({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="button subtle"
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const response = await fetch("/api/v1/notifications/read", {
            method: "POST",
            headers: mutationHeaders(),
            body: JSON.stringify({ all: true }),
          });
          if (response.ok) router.refresh();
        });
      }}
    >
      <CheckCheck size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
