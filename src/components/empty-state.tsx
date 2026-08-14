import { Compass } from "lucide-react";
import Link from "next/link";

export function EmptyState({
  title,
  body,
  actionHref,
  actionLabel,
}: {
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="panel">
      <div className="state-panel" style={{ minHeight: 250 }}>
        <span className="state-icon">
          <Compass size={23} aria-hidden="true" />
        </span>
        <h3>{title}</h3>
        <p>{body}</p>
        {actionHref && actionLabel && (
          <Link className="button primary" href={actionHref}>
            {actionLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
