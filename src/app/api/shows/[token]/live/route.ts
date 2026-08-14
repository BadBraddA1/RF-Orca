import { NextResponse } from "next/server";
import { isAdminUnlocked } from "@/lib/admin";
import { getShowPublic, getShowRevision } from "@/lib/store";

/**
 * Lightweight live sync: clients poll with ?r=<lastRevision>.
 * If unchanged → { unchanged: true, revision }.
 * If changed → full { show, admin, revision }.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get("r");
  const since = sinceRaw != null ? Number.parseInt(sinceRaw, 10) : NaN;

  const revision = await getShowRevision(token);
  if (revision == null) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }

  if (Number.isFinite(since) && since === revision) {
    return NextResponse.json({ unchanged: true, revision });
  }

  const show = await getShowPublic(token);
  if (!show) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }
  const admin = await isAdminUnlocked(token);
  return NextResponse.json({ unchanged: false, revision, show, admin });
}
