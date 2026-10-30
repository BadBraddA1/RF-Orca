import type { APIRoute } from "astro";
import { ablyConfigured, createShowTokenRequest } from "@/lib/ably";
import { json } from "@/lib/http";
import { getShowRevision } from "@/lib/store";

/**
 * Ably token auth for a single show channel (+ annotate publish).
 * GET /api/ably-auth?show=<shareToken>&clientId=<id>
 */
export const GET: APIRoute = async ({ url }) => {
  if (!ablyConfigured()) {
    return json({ error: "Ably not configured." }, 503);
  }

  const showToken = url.searchParams.get("show")?.trim();
  if (!showToken) {
    return json({ error: "Missing show token." }, 400);
  }

  const revision = await getShowRevision(showToken);
  if (revision == null) {
    return json({ error: "Show not found." }, 404);
  }

  const clientId =
    url.searchParams.get("clientId")?.trim() ||
    `orca-${showToken.slice(0, 10)}`;

  try {
    const tokenRequest = await createShowTokenRequest(showToken, clientId);
    return json(tokenRequest);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create Ably token.";
    return json({ error: message }, 500);
  }
};
