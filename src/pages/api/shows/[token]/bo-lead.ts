import type { APIRoute } from "astro";
import { z } from "zod";
import { isAdminUnlocked, lockBoLead, unlockBoLead } from "@/lib/admin";
import { json } from "@/lib/http";
import { getBoLeadToken, regenerateBoLeadToken } from "@/lib/store";

const bodySchema = z.object({
  action: z.enum(["unlock", "lock", "regenerate"]).default("unlock"),
  token: z.string().min(1).optional(),
});

function boLeadPath(shareToken: string, leadToken: string): string {
  return `/s/${shareToken}/bo/${leadToken}`;
}

/** Coordinator: read / rotate BO Lead link. Anyone with the secret can unlock. */
export const GET: APIRoute = async ({ params, cookies }) => {
  const token = params.token!;
  if (!(await isAdminUnlocked(token, cookies))) {
    return json({ error: "Admin unlock required." }, 403);
  }
  const leadToken = await getBoLeadToken(token);
  if (!leadToken) {
    return json({ error: "Show not found." }, 404);
  }
  return json({
    path: boLeadPath(token, leadToken),
    token: leadToken,
  });
};

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const token = params.token!;
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid request." }, 400);
  }

  if (parsed.data.action === "lock") {
    await lockBoLead(token, cookies);
    return json({ ok: true, boLead: false });
  }

  if (parsed.data.action === "regenerate") {
    if (!(await isAdminUnlocked(token, cookies))) {
      return json({ error: "Admin unlock required." }, 403);
    }
    const result = await regenerateBoLeadToken(token);
    if (!result) {
      return json({ error: "Show not found." }, 404);
    }
    await lockBoLead(token, cookies);
    return json({
      ok: true,
      show: result.show,
      path: boLeadPath(token, result.boLeadToken),
      token: result.boLeadToken,
    });
  }

  if (!parsed.data.token) {
    return json({ error: "BO Lead token required." }, 400);
  }

  const ok = await unlockBoLead(token, parsed.data.token, cookies);
  if (!ok) {
    return json({ error: "Invalid BO Lead link." }, 401);
  }
  return json({ ok: true, boLead: true });
};
