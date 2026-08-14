import { ChevronRight } from "lucide-react";
import Link from "next/link";

export function SectionHeader({
  title,
  description,
  href,
  linkLabel,
  headingId,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  headingId?: string;
}) {
  return (
    <header className="section-header">
      <div>
        <h2 id={headingId}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {href && linkLabel && (
        <Link className="text-link" href={href}>
          {linkLabel} <ChevronRight size={15} aria-hidden="true" />
        </Link>
      )}
    </header>
  );
}
