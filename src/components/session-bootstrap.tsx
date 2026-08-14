"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { mutationHeaders } from "./client-security";

export function SessionBootstrap() {
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/session/demo", {
      method: "POST",
      headers: mutationHeaders(),
      body: "{}",
      signal: controller.signal,
    })
      .then((response) => {
        if (response.status === 201) router.refresh();
      })
      .catch(() => {
        // Anonymous public browsing remains available when session bootstrap is offline.
      });
    return () => controller.abort();
  }, [router]);
  return null;
}
