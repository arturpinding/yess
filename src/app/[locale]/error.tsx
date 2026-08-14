"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("route_render_failed", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <section className="state-panel" role="alert">
      <span className="state-icon">
        <TriangleAlert aria-hidden="true" />
      </span>
      <p className="eyebrow">RADA</p>
      <h1>Midagi läks valesti / Something went wrong</h1>
      <p>Sinu valikud jäid alles. Your preferences are safe.</p>
      <button className="button primary" type="button" onClick={reset}>
        <RotateCcw size={17} aria-hidden="true" /> Proovi uuesti / Try again
      </button>
    </section>
  );
}
