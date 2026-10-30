import type { APIRoute } from "astro";
import { unlockBoLead } from "@/lib/admin";

/**
 * Claim BO Lead privileges via the secret link the coordinator shared.
 * Sets an httpOnly cookie and redirects to the show mark board.
 */
export const GET: APIRoute = async ({ params, cookies, url }) => {
  const token = params.token;
  const leadToken = params.leadToken;
  if (!token || !leadToken) {
    return Response.redirect(new URL("/", url), 302);
  }

  const ok = await unlockBoLead(token, leadToken, cookies);
  const dest = new URL(`/s/${token}`, url);
  if (!ok) {
    dest.searchParams.set("bo", "invalid");
    return Response.redirect(dest, 302);
  }
  dest.searchParams.set("bo", "1");
  return Response.redirect(dest, 302);
};
