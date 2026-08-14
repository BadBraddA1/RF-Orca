import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createShow,
  getStorageMode,
  listActiveShows,
} from "@/lib/store";
import { ACTIVE_SHOW_HOME_DAYS } from "@/lib/types";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  adminPassword: z.string().min(4).max(200),
});

/** Active shows (created within ACTIVE_SHOW_HOME_DAYS). Older shows are hidden, not deleted. */
export async function GET() {
  try {
    const shows = await listActiveShows(ACTIVE_SHOW_HOME_DAYS);
    return NextResponse.json({
      shows,
      windowDays: ACTIVE_SHOW_HOME_DAYS,
      storageMode: getStorageMode(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Could not list shows." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Show name and admin password (min 4 chars) are required." },
        { status: 400 },
      );
    }
    const show = await createShow(parsed.data);
    return NextResponse.json({
      show,
      storageMode: getStorageMode(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Could not create show." },
      { status: 500 },
    );
  }
}
