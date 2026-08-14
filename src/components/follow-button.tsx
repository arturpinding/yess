"use client";

import { Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FollowTargetType } from "@/domain/view-models";
import { mutationHeaders } from "./client-security";

export function FollowButton({
  targetId,
  targetType,
  initialFollowing,
  followLabel,
  followingLabel,
  compact = false,
}: {
  targetId: string;
  targetType: FollowTargetType;
  initialFollowing: boolean;
  followLabel: string;
  followingLabel: string;
  compact?: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    const next = !following;
    setFollowing(next);
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/v1/follows", {
          method: next ? "POST" : "DELETE",
          headers: mutationHeaders(),
          body: JSON.stringify({ targetId, targetType }),
        });
        if (!response.ok) throw new Error(`Follow request failed: ${response.status}`);
        router.refresh();
      } catch {
        setFollowing(!next);
        setError("Action failed");
      }
    });
  }

  return (
    <span>
      <button
        className="follow-button"
        type="button"
        data-following={following}
        aria-pressed={following}
        disabled={pending}
        onClick={toggle}
        title={following ? followingLabel : followLabel}
      >
        {following ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
        {!compact && <span>{following ? followingLabel : followLabel}</span>}
      </button>
      {error && (
        <span className="sr-only" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
