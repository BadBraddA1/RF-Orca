import { NewShowForm } from "@/components/NewShowForm";

export default function HomePage() {
  return (
    <main className="hero">
      <div className="hero-inner">
        <p className="brand-mark">RF-Orca</p>
        <h1>RF-Orca</h1>
        <p className="hero-lead">
          Import a Shure Workbench plan. Share one link. Crews mark what’s
          deployed — and where.
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
