import type { APIRoute } from "astro";
import { z } from "zod";
import { getBoardRole, isAdminUnlocked } from "@/lib/admin";
import { crewPatchBlocked } from "@/lib/crew-guard";
import { json } from "@/lib/http";
import { deleteChannels, getShowPublic, updateChannel } from "@/lib/store";

const bodySchema = z.object({
  status: z.enum(["allowed", "blocked", "unreviewed"]).optional(),
  deployed: z.boolean().optional(),
  roomName: z.string().nullable().optional(),
  groupName: z.string().nullable().optional(),
  assignedTo: z.string().max(80).nullable().optional(),
  inUse: z.boolean().optional(),
  micKind: z.enum(["handheld", "lav"]).nullable().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  deployedBy: z.string().nullable().optional(),
});

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  const token = params.token!;
  const id = params.id!;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid patch." }, 400);
  }

  const role = await getBoardRole(token, cookies);
  const admin = role === "admin";
  if (
    (parsed.data.status ||
      parsed.data.groupName !== undefined ||
      parsed.data.name !== undefined) &&
    !admin
  ) {
    return json({ error: "Admin unlock required." }, 403);
  }

  if (!admin) {
    const current = await getShowPublic(token);
    if (!current) {
      return json({ error: "Channel not found." }, 404);
    }
    const channel = current.channels.find((c) => c.id === id);
    if (!channel) {
      return json({ error: "Channel not found." }, 404);
    }
    const blocked = crewPatchBlocked(
      current.features,
      channel,
      parsed.data,
      role,
    );
    if (blocked) {
      return json({ error: blocked }, 403);
    }
  }

  try {
    const show = await updateChannel(token, id, parsed.data);
    if (!show) {
      return json({ error: "Channel not found." }, 404);
    }
    return json({ show });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update channel.";
    return json({ error: message }, 400);
  }
};

/** Delete one frequency from the show (Tools unlocked). */
export const DELETE: APIRoute = async ({ params, cookies }) => {
  const token = params.token!;
  const id = params.id!;
  if (!(await isAdminUnlocked(token, cookies))) {
    return json({ error: "Admin unlock required." }, 403);
  }

  const show = await deleteChannels(token, [id]);
  if (!show) {
    return json({ error: "Show not found." }, 404);
  }
  return json({ show });
};
