import type { APIRoute } from "astro";
import { z } from "zod";
import { getBoardRole, isAdminUnlocked, lockAdmin } from "@/lib/admin";
import { json } from "@/lib/http";
import { deleteShow, getShowPublic, renameShow } from "@/lib/store";

export const GET: APIRoute = async ({ params, cookies }) => {
  const token = params.token!;
  const show = await getShowPublic(token);
  if (!show) {
    return json({ error: "Show not found." }, 404);
  }
  const role = await getBoardRole(token, cookies);
  return json({
    show,
    admin: role === "admin",
    boLead: role === "boLead" || role === "admin",
  });
};

const patchBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  const token = params.token!;
  if (!(await isAdminUnlocked(token, cookies))) {
    return json({ error: "Admin unlock required." }, 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Show name required (1–120 characters)." }, 400);
  }

  const show = await renameShow(token, parsed.data.name);
  if (!show) {
    return json({ error: "Show not found." }, 404);
  }
  return json({ show });
};

const deleteBodySchema = z.object({
  /** Must match the show name exactly (case-sensitive) to confirm. */
  confirmName: z.string().min(1),
});

export const DELETE: APIRoute = async ({ params, request, cookies }) => {
  const token = params.token!;
  if (!(await isAdminUnlocked(token, cookies))) {
    return json({ error: "Admin unlock required." }, 403);
  }

  const show = await getShowPublic(token);
  if (!show) {
    return json({ error: "Show not found." }, 404);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = deleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Type the show name to confirm delete." }, 400);
  }
  if (parsed.data.confirmName !== show.name) {
    return json({ error: "Confirmation name does not match." }, 400);
  }

  const ok = await deleteShow(token);
  if (!ok) {
    return json({ error: "Could not delete show." }, 500);
  }
  await lockAdmin(token, cookies);
  return json({ ok: true });
};
