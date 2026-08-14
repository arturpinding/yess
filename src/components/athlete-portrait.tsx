"use client";

import Image from "next/image";
import { useState } from "react";

export function AthletePortrait({
  initials,
  portraitUrl,
  demoLabel,
  portraitAlt,
}: {
  initials: string;
  portraitUrl?: string;
  demoLabel: string;
  portraitAlt: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const showImage = Boolean(portraitUrl && portraitUrl !== failedSource);

  return (
    <div className="athlete-portrait">
      {showImage && portraitUrl ? (
        <Image
          className="athlete-portrait-image"
          src={portraitUrl}
          alt={portraitAlt}
          fill
          priority
          sizes="(max-width: 760px) 100vw, 36vw"
          unoptimized
          onError={() => setFailedSource(portraitUrl)}
        />
      ) : (
        <span className="athlete-portrait-fallback" role="img" aria-label={portraitAlt}>
          <span aria-hidden="true">{initials}</span>
        </span>
      )}
      <small>{demoLabel}</small>
    </div>
  );
}
