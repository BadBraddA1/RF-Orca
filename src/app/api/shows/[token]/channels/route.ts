import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUnlocked } from "@/lib/admin";
import {
  addManualChannel,
  bulkSetChannelGroup,
  bulkSetChannelStatus,
} from "@/lib/store";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  frequencyMhz: z.number().positive().max(10000),
  groupName: z.string().trim().min(1).max(80).nullable().optional(),
  band: z.string().trim().min(1).max(80).nullable().optional(),
});

const bulkSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    channelIds: z.array(z.string().min(1)).min(1).max(500),
    status: z.enum(["allowed", "blocked", "unreviewed"]),
  }),
  z.object({
    action: z.literal("group"),
    channelIds: z.array(z.string().min(1)).min(1).max(500),
    groupName: z.string().trim().min(1).max(80).nullable(),
  }),
]);

/** Add a channel by hand when there’s no Workbench CSV for this show. */
export async function POST(
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
    return NextResponse.json(
      { error: "Need a channel name and frequency (MHz)." },
      { status: 400 },
    );
  }

  const show = await addManualChannel(token, {
    name: parsed.data.name,
    frequencyMhz: parsed.data.frequencyMhz,
    groupName: parsed.data.groupName ?? null,
    band: parsed.data.band ?? null,
  });
  if (!show) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }
  return NextResponse.json({ show });
}

/** Bulk status or group for selected / filtered channels. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!(await isAdminUnlocked(token))) {
    return NextResponse.json({ error: "Admin unlock required." }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  // Back-compat: old clients send { channelIds, status } without action
  const normalized =
    json &&
    typeof json === "object" &&
    !("action" in (json as object)) &&
    "status" in (json as object)
      ? { ...(json as object), action: "status" as const }
      : json;
  const parsed = bulkSchema.safeParse(normalized);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid bulk payload." },
      { status: 400 },
    );
  }

  if (parsed.data.action === "group") {
    const show = await bulkSetChannelGroup(
      token,
      parsed.data.channelIds,
      parsed.data.groupName,
    );
    if (!show) {
      return NextResponse.json({ error: "Show not found." }, { status: 404 });
    }
    return NextResponse.json({ show, updated: parsed.data.channelIds.length });
  }

  const show = await bulkSetChannelStatus(
    token,
    parsed.data.channelIds,
    parsed.data.status,
  );
  if (!show) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }
  return NextResponse.json({ show, updated: parsed.data.channelIds.length });
}
