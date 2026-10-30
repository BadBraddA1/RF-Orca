import type { APIRoute } from "astro";
import { getBoardRole } from "@/lib/admin";
import { json } from "@/lib/http";
import { getShowPublic, getShowRevision } from "@/lib/store";

/**
 * Lightweight live sync: clients poll with ?r=<lastRevision>.
 * If unchanged → { unchanged: true, revision }.
 * If changed → full { show, admin, boLead, revision }.
 */
export const GET: APIRoute = async ({ params, url, cookies }) => {
  const token = params.token!;
  const sinceRaw = url.searchParams.get("r");
  const since = sinceRaw != null ? Number.parseInt(sinceRaw, 10) : NaN;

  const revision = await getShowRevision(token);
  if (revision == null) {
    return json({ error: "Show not found." }, 404);
  }

  if (Number.isFinite(since) && since === revision) {
    return json({ unchanged: true, revision });
  }

  const show = await getShowPublic(token);
  if (!show) {
    return json({ error: "Show not found." }, 404);
  }
  const role = await getBoardRole(token, cookies);
  return json({
    unchanged: false,
    revision,
    show,
    admin: role === "admin",
    boLead: role === "boLead" || role === "admin",
  });
};
