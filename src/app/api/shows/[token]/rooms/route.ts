import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUnlocked } from "@/lib/admin";
import { setRooms } from "@/lib/store";

const bodySchema = z.object({
  rooms: z.array(z.string().trim().min(1).max(80)).max(40),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!(await isAdminUnlocked(token))) {
    return NextResponse.json({ error: "Admin unlock required." }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid rooms list." }, { status: 400 });
  }

  const show = await setRooms(token, parsed.data.rooms);
  if (!show) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }
  return NextResponse.json({ show });
}
