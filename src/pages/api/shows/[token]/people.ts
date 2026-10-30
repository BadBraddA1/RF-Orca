import type { APIRoute } from "astro";
import { z } from "zod";
import { isAdminUnlocked } from "@/lib/admin";
import { json } from "@/lib/http";
import { setPeople } from "@/lib/store";

const bodySchema = z.object({
  people: z.array(z.string().trim().min(1).max(80)).max(80),
});

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const token = params.token!;
  if (!(await isAdminUnlocked(token, cookies))) {
    return json({ error: "Admin unlock required." }, 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid names list." }, 400);
  }

  const show = await setPeople(token, parsed.data.people);
  if (!show) {
    return json({ error: "Show not found." }, 404);
  }
  return json({ show });
};
