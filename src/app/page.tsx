import { BrandLockup } from "@/components/BrandLockup";
import { NewShowForm } from "@/components/NewShowForm";

export default function HomePage() {
  return (
    <main className="hero">
      <div className="hero-inner">
        <BrandLockup size="hero" />
        <h1>RF Orchestrator</h1>
        <p className="hero-lead">
          Orca — a lean, crew-first alternative to SoundBase for the floor:
          share one link, group channels, and mark what’s deployed.
        </p>
        <p className="hero-support">
          Bring a Workbench CSV or add channels by hand. No accounts — create a
          show, set an admin password, and send crews the mark view.
        </p>
        <NewShowForm />
      </div>
    </main>
  );
}
