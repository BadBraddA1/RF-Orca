import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUnlocked } from "@/lib/admin";
import { updateChannel } from "@/lib/store";

const bodySchema = z.object({
  status: z.enum(["allowed", "blocked", "unreviewed"]).optional(),
  deployed: z.boolean().optional(),
  roomName: z.string().nullable().optional(),
  deployedBy: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await context.params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid patch." }, { status: 400 });
  }

  if (parsed.data.status && !(await isAdminUnlocked(token))) {
    return NextResponse.json({ error: "Admin unlock required." }, { status: 403 });
  }

  try {
    const show = await updateChannel(token, id, parsed.data);
    if (!show) {
      return NextResponse.json({ error: "Channel not found." }, { status: 404 });
    }
    return NextResponse.json({ show });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update channel.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
