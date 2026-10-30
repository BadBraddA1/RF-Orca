import type { APIRoute } from "astro";
import { z } from "zod";
import { lockAdmin, unlockAdmin } from "@/lib/admin";
import { json } from "@/lib/http";

const bodySchema = z.object({
  password: z.string().min(1).optional(),
  action: z.enum(["unlock", "lock"]).default("unlock"),
});

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const token = params.token!;
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid request." }, 400);
  }

  if (parsed.data.action === "lock") {
    await lockAdmin(token, cookies);
    return json({ ok: true, admin: false });
  }

  if (!parsed.data.password) {
    return json({ error: "Password required." }, 400);
  }

  const ok = await unlockAdmin(token, parsed.data.password, cookies);
  if (!ok) {
    return json({ error: "Wrong password." }, 401);
  }
  return json({ ok: true, admin: true });
};
