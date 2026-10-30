import type { APIRoute } from "astro";
import { z } from "zod";
import { isAdminUnlocked } from "@/lib/admin";
import { json } from "@/lib/http";
import { setRooms } from "@/lib/store";

const bodySchema = z.object({
  rooms: z.array(z.string().trim().min(1).max(80)).max(40),
});

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const token = params.token!;
  if (!(await isAdminUnlocked(token, cookies))) {
    return json({ error: "Admin unlock required." }, 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid rooms list." }, 400);
  }

  const show = await setRooms(token, parsed.data.rooms);
  if (!show) {
    return json({ error: "Show not found." }, 404);
  }
  return json({ show });
};
