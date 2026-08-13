import { NextResponse } from "next/server";
import { z } from "zod";
import { lockAdmin, unlockAdmin } from "@/lib/admin";

const bodySchema = z.object({
  password: z.string().min(1).optional(),
  action: z.enum(["unlock", "lock"]).default("unlock"),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (parsed.data.action === "lock") {
    await lockAdmin(token);
    return NextResponse.json({ ok: true, admin: false });
  }

  if (!parsed.data.password) {
    return NextResponse.json({ error: "Password required." }, { status: 400 });
  }

  const ok = await unlockAdmin(token, parsed.data.password);
  if (!ok) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, admin: true });
}
