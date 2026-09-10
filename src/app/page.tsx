import Link from "next/link";
import { BrandLockup } from "@/components/BrandLockup";
import { NewShowForm } from "@/components/NewShowForm";
import { listActiveShows } from "@/lib/store";
import { ACTIVE_SHOW_HOME_DAYS } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const active = await listActiveShows(ACTIVE_SHOW_HOME_DAYS);

  return (
    <main className="hero hero-create">
      <div className="hero-create-inner">
        <BrandLockup size="header" />

        <div className="hero-create-grid">
          <div className="hero-copy">
            <h1>New show</h1>
            <p className="hero-lead">
              Share the plan with the floor — one link to group channels and
              mark what’s deployed.
            </p>
            <p className="hero-support">
              Bring a Workbench CSV or add channels by hand. No accounts. Active
              shows stay listed here for {ACTIVE_SHOW_HOME_DAYS} days, then drop
              off (not deleted).
            </p>
            <p className="hero-demo-link">
              <Link href="/demo" className="btn-ghost">
                Watch a live demo
              </Link>
            </p>
          </div>

          <NewShowForm />
        </div>

        <section className="active-shows" aria-label="Shows happening now">
          <div className="active-shows-head">
            <h2>Happening now</h2>
            <p>Created in the last {ACTIVE_SHOW_HOME_DAYS} days</p>
          </div>
          {active.length === 0 ? (
            <p className="active-shows-empty">
              No active shows yet — create one above.
            </p>
          ) : (
            <ul className="active-shows-list">
              {active.map((show) => (
                <li key={show.shareToken}>
                  <Link href={`/s/${show.shareToken}`} className="active-show-card">
                    <span className="active-show-name">{show.name}</span>
                    <span className="active-show-meta">
                      {show.channelCount === 0
                        ? "No channels yet"
                        : `${show.deployedCount}/${show.channelCount} deployed`}
                      <span className="active-show-age">
                        · {formatAge(show.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function formatAge(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
