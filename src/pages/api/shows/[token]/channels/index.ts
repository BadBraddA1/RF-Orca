import type { APIRoute } from "astro";
import { z } from "zod";
import { isAdminUnlocked } from "@/lib/admin";
import { json } from "@/lib/http";
import {
  addManualChannel,
  bulkSetChannelGroup,
  bulkSetChannelRoom,
  bulkSetChannelStatus,
  deleteChannels,
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
  z.object({
    action: z.literal("room"),
    channelIds: z.array(z.string().min(1)).min(1).max(500),
    roomName: z.string().trim().min(1).max(80).nullable(),
  }),
  z.object({
    action: z.literal("delete"),
    channelIds: z.array(z.string().min(1)).min(1).max(500),
  }),
]);

/** Add a channel by hand when there’s no Workbench CSV for this show. */
export const POST: APIRoute = async ({ params, request, cookies }) => {
  const token = params.token!;
  if (!(await isAdminUnlocked(token, cookies))) {
    return json({ error: "Admin unlock required." }, 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Need a channel name and frequency (MHz)." },
      400,
    );
  }

  const show = await addManualChannel(token, {
    name: parsed.data.name,
    frequencyMhz: parsed.data.frequencyMhz,
    groupName: parsed.data.groupName ?? null,
    band: parsed.data.band ?? null,
  });
  if (!show) {
    return json({ error: "Show not found." }, 404);
  }
  return json({ show });
};

/** Bulk status or group for selected / filtered channels. */
export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  const token = params.token!;
  if (!(await isAdminUnlocked(token, cookies))) {
    return json({ error: "Admin unlock required." }, 403);
  }

  const body = await request.json().catch(() => null);
  // Back-compat: old clients send { channelIds, status } without action
  const normalized =
    body &&
    typeof body === "object" &&
    !("action" in (body as object)) &&
    "status" in (body as object)
      ? { ...(body as object), action: "status" as const }
      : body;
  const parsed = bulkSchema.safeParse(normalized);
  if (!parsed.success) {
    return json({ error: "Invalid bulk payload." }, 400);
  }

  if (parsed.data.action === "group") {
    const show = await bulkSetChannelGroup(
      token,
      parsed.data.channelIds,
      parsed.data.groupName,
    );
    if (!show) {
      return json({ error: "Show not found." }, 404);
    }
    return json({ show, updated: parsed.data.channelIds.length });
  }

  if (parsed.data.action === "room") {
    const show = await bulkSetChannelRoom(
      token,
      parsed.data.channelIds,
      parsed.data.roomName,
    );
    if (!show) {
      return json({ error: "Show not found." }, 404);
    }
    return json({ show, updated: parsed.data.channelIds.length });
  }

  if (parsed.data.action === "delete") {
    const show = await deleteChannels(token, parsed.data.channelIds);
    if (!show) {
      return json({ error: "Show not found." }, 404);
    }
    return json({ show, deleted: parsed.data.channelIds.length });
  }

  const show = await bulkSetChannelStatus(
    token,
    parsed.data.channelIds,
    parsed.data.status,
  );
  if (!show) {
    return json({ error: "Show not found." }, 404);
  }
  return json({ show, updated: parsed.data.channelIds.length });
};
