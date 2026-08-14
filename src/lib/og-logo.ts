import { readFile } from "node:fs/promises"
import { join } from "node:path"

/** PNG mark as data URL for ImageResponse (Satori can't use local paths). */
export async function loadOgLogoDataUrl(): Promise<string | null> {
  try {
    const buf = await readFile(join(process.cwd(), "public/brand/icon.png"))
    return `data:image/png;base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}
