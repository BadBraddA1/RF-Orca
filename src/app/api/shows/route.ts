import { NextResponse } from "next/server";
import { z } from "zod";
import { createShow, getStorageMode } from "@/lib/store";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  adminPassword: z.string().min(4).max(200),
});

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
