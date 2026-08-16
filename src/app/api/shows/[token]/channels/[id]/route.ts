import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUnlocked } from "@/lib/admin";
import { crewPatchBlocked } from "@/lib/crew-guard";
import { getShowPublic, updateChannel } from "@/lib/store";

const bodySchema = z.object({
  status: z.enum(["allowed", "blocked", "unreviewed"]).optional(),
  deployed: z.boolean().optional(),
  roomName: z.string().nullable().optional(),
  groupName: z.string().nullable().optional(),
  assignedTo: z.string().max(80).nullable().optional(),
  inUse: z.boolean().optional(),
  name: z.string().trim().min(1).max(80).optional(),
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

  const admin = await isAdminUnlocked(token);
  if (
    (parsed.data.status ||
      parsed.data.groupName !== undefined ||
      parsed.data.name !== undefined) &&
    !admin
  ) {
    return NextResponse.json({ error: "Admin unlock required." }, { status: 403 });
  }

  if (!admin) {
    const current = await getShowPublic(token);
    if (!current) {
      return NextResponse.json({ error: "Channel not found." }, { status: 404 });
    }
    const channel = current.channels.find((c) => c.id === id);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found." }, { status: 404 });
    }
    const blocked = crewPatchBlocked(current.features, channel, parsed.data);
    if (blocked) {
      return NextResponse.json({ error: blocked }, { status: 403 });
    }
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
