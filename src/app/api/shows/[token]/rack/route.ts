import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUnlocked } from "@/lib/admin";
import { fillRackSlots, setRackSize } from "@/lib/store";

const bodySchema = z.object({
  rackSize: z.union([z.literal(12), z.literal(24)]).optional(),
  fillEmpty: z.boolean().optional(),
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
    return NextResponse.json({ error: "Invalid rack settings." }, { status: 400 });
  }

  let show = null;
  if (parsed.data.rackSize) {
    show = await setRackSize(token, parsed.data.rackSize);
  }
  if (parsed.data.fillEmpty) {
    show = await fillRackSlots(token);
  }
  if (!show) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }
  return NextResponse.json({ show });
}
