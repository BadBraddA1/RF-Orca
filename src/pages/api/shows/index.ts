import type { APIRoute } from "astro";
import { z } from "zod";
import { json } from "@/lib/http";
import { createShow, getStorageMode, listActiveShows } from "@/lib/store";
import { ACTIVE_SHOW_HOME_DAYS } from "@/lib/types";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  adminPassword: z.string().min(4).max(200),
});

/** Active shows (created within ACTIVE_SHOW_HOME_DAYS). Older shows are hidden, not deleted. */
export const GET: APIRoute = async () => {
  try {
    const shows = await listActiveShows(ACTIVE_SHOW_HOME_DAYS);
    return json({
      shows,
      windowDays: ACTIVE_SHOW_HOME_DAYS,
      storageMode: getStorageMode(),
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Could not list shows." }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return json(
        {
          error: "Show name and admin password (min 4 chars) are required.",
        },
        400,
      );
    }
    const show = await createShow(parsed.data);
    return json({
      show,
      storageMode: getStorageMode(),
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Could not create show." }, 500);
  }
};
