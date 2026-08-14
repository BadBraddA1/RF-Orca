import { BrandLockup } from "@/components/BrandLockup";
import { NewShowForm } from "@/components/NewShowForm";

export default function HomePage() {
  return (
    <main className="hero">
      <div className="hero-inner">
        <BrandLockup size="hero" />
        <h1>RF Orchestrator</h1>
        <p className="hero-lead">
          Orca — import a Shure Workbench plan, share one link, and let crews
          mark what’s deployed and where.
        </p>
        <p className="hero-support">
          No accounts. Create a show, set an admin password for edits, and send
          crews straight to the mark view.
        </p>
        <NewShowForm />
      </div>
    </main>
  );
}
