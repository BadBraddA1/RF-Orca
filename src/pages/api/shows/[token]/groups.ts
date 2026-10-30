import type { APIRoute } from "astro";
import { z } from "zod";
import { isAdminUnlocked } from "@/lib/admin";
import { json } from "@/lib/http";
import { setGroups } from "@/lib/store";

const bodySchema = z.object({
  groups: z.array(z.string().trim().min(1).max(80)).max(40),
});

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const token = params.token!;
  if (!(await isAdminUnlocked(token, cookies))) {
    return json({ error: "Admin unlock required." }, 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid groups list." }, 400);
  }

  const show = await setGroups(token, parsed.data.groups);
  if (!show) {
    return json({ error: "Show not found." }, 404);
  }
  return json({ show });
};
