import { BrandLockup } from "@/components/BrandLockup";
import { NewShowForm } from "@/components/NewShowForm";

export default function HomePage() {
  return (
    <main className="hero hero-create">
      <div className="hero-create-inner">
        <BrandLockup size="header" showTagline />

        <div className="hero-create-grid">
          <div className="hero-copy">
            <p className="hero-kicker">Radio Frequency Orchestrator</p>
            <h1>New show</h1>
            <p className="hero-lead">
              Lean SoundBase alternative for the floor — one link, mark what’s
              deployed.
            </p>
            <p className="hero-support">
              Workbench CSV or hand-entry. No accounts. Save the share link —
              shows aren’t listed here.
            </p>
          </div>

          <NewShowForm />
        </div>
      </div>
    </main>
  );
}
