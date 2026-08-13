import { NextResponse } from "next/server";
import { isAdminUnlocked } from "@/lib/admin";
import { parseWwbCsv } from "@/lib/csv";
import { replaceChannelsFromImport } from "@/lib/store";

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!(await isAdminUnlocked(token))) {
    return NextResponse.json({ error: "Admin unlock required." }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file required." }, { status: 400 });
  }

  const text = await file.text();
  const { rows, warnings } = parseWwbCsv(text);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No channels found in file.", warnings },
      { status: 400 },
    );
  }

  const show = await replaceChannelsFromImport(token, rows);
  if (!show) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }

  return NextResponse.json({ show, warnings, imported: rows.length });
}
