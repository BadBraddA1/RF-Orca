import type { APIRoute } from "astro";
import { z } from "zod";
import { isAdminUnlocked } from "@/lib/admin";
import { json } from "@/lib/http";
import { updateDeployGroup, updateShowFeatures } from "@/lib/store";

const bodySchema = z.object({
  deploy: z.boolean().optional(),
  rooms: z.boolean().optional(),
  assignments: z.boolean().optional(),
  groups: z.boolean().optional(),
  status: z.boolean().optional(),
  lockDeployed: z.boolean().optional(),
  lockStaged: z.boolean().optional(),
  crewLocked: z.boolean().optional(),
  /** null clears; omit leaves unchanged */
  deployGroupName: z.string().max(80).nullable().optional(),
});

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const token = params.token!;
  if (!(await isAdminUnlocked(token, cookies))) {
    return json({ error: "Admin unlock required." }, 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid settings." }, 400);
  }

  const { deployGroupName, ...featurePatch } = parsed.data;
  const hasFeatures = Object.keys(featurePatch).length > 0;

  let show = null;
  if (hasFeatures) {
    show = await updateShowFeatures(token, featurePatch);
    if (!show) {
      return json({ error: "Show not found." }, 404);
    }
  }

  if (deployGroupName !== undefined) {
    show = await updateDeployGroup(token, deployGroupName);
    if (!show) {
      return json({ error: "Show not found." }, 404);
    }
  }

  if (!show) {
    return json({ error: "Nothing to update." }, 400);
  }
  return json({ show });
};
