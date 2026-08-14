import { MapPinOff } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <section className="state-panel">
      <span className="state-icon">
        <MapPinOff aria-hidden="true" />
      </span>
      <p className="eyebrow">404</p>
      <h1>Seda rada ei leitud / Track not found</h1>
      <p>Sündmus võib olla ümber tõstetud või link aegunud.</p>
      <Link className="button primary" href="/et">
        Tagasi avalehele
      </Link>
    </section>
  );
}
