import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { PersonSummary } from "@/domain/view-models";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { FollowButton } from "./follow-button";

export function AthleteCard({
  athlete,
  locale,
  dictionary: d,
  following,
}: {
  athlete: PersonSummary;
  locale: Locale;
  dictionary: Dictionary;
  following: boolean;
}) {
  return (
    <article className="athlete-card">
      <Link
        className="athlete-avatar"
        href={`/${locale}/athletes/${athlete.slug}`}
        aria-hidden="true"
        tabIndex={-1}
      >
        {athlete.initials}
      </Link>
      <Link className="athlete-card-copy" href={`/${locale}/athletes/${athlete.slug}`}>
        <strong>{athlete.name}</strong>
        <small>
          {athlete.sportName} · {athlete.nationality}
        </small>
      </Link>
      <FollowButton
        targetId={athlete.id}
        targetType="athlete"
        initialFollowing={following}
        followLabel={d.follow}
        followingLabel={d.following}
        compact
      />
      <ChevronRight className="sr-only" aria-hidden="true" />
    </article>
  );
}
