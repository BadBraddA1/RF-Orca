import Papa from "papaparse";
import type { ParsedChannelRow } from "./types";

function parseFrequency(raw: string): number | null {
  const cleaned = raw.replace(/mhz/i, "").replace(/,/g, "").trim();
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return String(value).trim();
}

function pick(
  row: Record<string, unknown>,
  aliases: string[],
): string | null {
  for (const alias of aliases) {
    const key = Object.keys(row).find((k) => normalizeHeader(k) === alias);
    if (!key) continue;
    const text = cellText(row[key]);
    if (text) return text;
  }
  return null;
}

/**
 * Workbench / Excel often save "CSV" as UTF-16 (with or without BOM).
 * `File.text()` / UTF-8 decode turns those into garbage with no frequencies.
 */
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buf);
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buf);
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buf);
  }
  // UTF-16LE without BOM: lots of NUL bytes in the first line
  const sample = buf.subarray(0, Math.min(buf.length, 200));
  let nuls = 0;
  for (const b of sample) if (b === 0) nuls += 1;
  if (sample.length > 20 && nuls > sample.length / 4) {
    return new TextDecoder("utf-16le").decode(buf);
  }
  return new TextDecoder("utf-8").decode(buf);
}

function splitLines(text: string): string[] {
  return text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
}

/** Score a line as a likely WWB/CSV header (not a title or section label). */
function headerScore(line: string, delimiter: string): number {
  const parts = line.split(delimiter).map((p) => p.trim());
  if (parts.length < 2) return 0;
  const lower = line.toLowerCase();
  let score = parts.length;
  if (/\bfreq(uency)?\b/.test(lower)) score += 8;
  if (/\bchannel\s*name\b/.test(lower) || /\bdevice\s*name\b/.test(lower)) {
    score += 6;
  } else if (/\bchannel\b/.test(lower)) {
    score += 3;
  }
  if (/\bband\b/.test(lower)) score += 2;
  if (/\btype\b/.test(lower)) score += 2;
  if (/\bgroup\b/.test(lower)) score += 2;
  if (/\bname\b/.test(lower)) score += 2;
  // Title / section rows are usually one short phrase
  if (parts.length === 1) score = 0;
  return score;
}

function detectDelimiter(lines: string[]): string {
  const candidates = [",", "\t", ";"] as const;
  let best = ",";
  let bestScore = -1;
  for (const d of candidates) {
    let score = 0;
    for (const line of lines.slice(0, 40)) {
      if (!line.trim()) continue;
      score = Math.max(score, headerScore(line, d));
    }
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/**
 * Workbench exports often start with a show title / "Primary Frequencies"
 * row before the real column header. Skip preamble so Papa doesn't lock to
 * one column ("expected 1 fields but parsed 6").
 */
function sliceFromHeader(text: string): {
  csv: string;
  delimiter: string;
  skipped: number;
} {
  const lines = splitLines(text);
  const delimiter = detectDelimiter(lines);
  let bestIdx = 0;
  let best = -1;
  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    const line = lines[i]?.trim() ?? "";
    if (!line) continue;
    const score = headerScore(line, delimiter);
    if (score > best) {
      best = score;
      bestIdx = i;
    }
  }
  // Prefer a scored header; otherwise first line with 3+ fields
  if (best < 5) {
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      const line = lines[i]?.trim() ?? "";
      if (line.split(delimiter).length >= 3) {
        bestIdx = i;
        break;
      }
    }
  }
  return {
    csv: lines.slice(bestIdx).join("\n"),
    delimiter,
    skipped: bestIdx,
  };
}

function rowsFromParsed(
  data: Record<string, unknown>[],
  warnings: string[],
): ParsedChannelRow[] {
  const rows: ParsedChannelRow[] = [];
  let currentZone: string | null = null;
  let currentIsBackup = false;

  for (const row of data) {
    const values = Object.values(row).map((v) => cellText(v));
    const nonEmpty = values.filter(Boolean);
    if (nonEmpty.length === 0) continue;

    const first = nonEmpty[0] ?? "";
    const firstLower = first.toLowerCase();
    if (
      nonEmpty.length === 1 ||
      (nonEmpty.length <= 2 &&
        (firstLower.includes("primary") ||
          firstLower.includes("backup") ||
          firstLower.includes("zone") ||
          firstLower.includes("frequencies")))
    ) {
      if (firstLower.includes("backup")) currentIsBackup = true;
      if (firstLower.includes("primary")) currentIsBackup = false;
      if (!firstLower.includes("frequencies")) {
        currentZone = first.replace(/[:\-–].*$/, "").trim() || currentZone;
      }
      continue;
    }

    const freqRaw =
      pick(row, [
        "frequency",
        "freq",
        "frequency (mhz)",
        "freq mhz",
        "frequency mhz",
        "tx frequency",
        "rf frequency",
      ]) ??
      values.find((v) => /\d+(\.\d+)?/.test(v) && /mhz|\d{3}/i.test(v)) ??
      null;

    if (!freqRaw) continue;
    const frequencyMhz = parseFrequency(freqRaw);
    if (frequencyMhz == null) continue;

    // Avoid treating a lone frequency cell's neighbor numbers as "name"
    const name =
      pick(row, [
        "channel name",
        "name",
        "channel",
        "label",
        "device name",
        "transmitter name",
      ]) ?? `CH ${frequencyMhz.toFixed(3)}`;

    rows.push({
      name,
      frequencyMhz,
      band: pick(row, [
        "band",
        "rf band",
        "tx band",
        "frequency band",
        "tuner band",
        "wwb band",
      ]),
      type: pick(row, ["type"]),
      groupChannel: pick(row, [
        "group & channel",
        "group and channel",
        "group/channel",
        "g & ch",
        "group",
      ]),
      zone: currentZone,
      isBackup: currentIsBackup,
    });
  }

  return rows;
}

/**
 * Parses Shure WWB inventory / coordination-style CSV exports.
 * Tolerates title/preamble rows and section markers (Primary/Backup/zone).
 */
export function parseWwbCsv(text: string): {
  rows: ParsedChannelRow[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const cleaned = text.replace(/^\uFEFF/, "");
  const { csv, delimiter, skipped } = sliceFromHeader(cleaned);
  if (skipped > 0) {
    warnings.push(
      `Skipped ${skipped} preamble line${skipped === 1 ? "" : "s"} before the column header.`,
    );
  }

  const parsed = Papa.parse<Record<string, unknown>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    delimiter,
    dynamicTyping: false,
    transformHeader: (h) => String(h ?? "").trim(),
  });

  // Field-count mismatches after a bad header — don't surface those as user warnings
  // if we still recover rows. Keep other Papa issues.
  const usefulErrors = parsed.errors.filter(
    (e) => !/too many fields/i.test(e.message || ""),
  );
  if (usefulErrors.length) {
    warnings.push(
      ...usefulErrors.slice(0, 5).map((e) => e.message || "CSV parse issue"),
    );
  }

  let rows = rowsFromParsed(parsed.data, warnings);

  // Second pass: headerless / wrong header — parse as arrays and find freq column
  if (rows.length === 0 || rows.every((r) => r.name.startsWith("CH "))) {
    const raw = Papa.parse<string[]>(csv, {
      header: false,
      skipEmptyLines: "greedy",
      delimiter,
      dynamicTyping: false,
    });
    const matrix = raw.data.filter((r) => r.some((c) => cellText(c)));
    if (matrix.length >= 2) {
      let headerIdx = 0;
      let best = -1;
      for (let i = 0; i < Math.min(matrix.length, 20); i++) {
        const score = headerScore(matrix[i].join(delimiter), delimiter);
        if (score > best) {
          best = score;
          headerIdx = i;
        }
      }
      const headers = matrix[headerIdx].map((h) => cellText(h));
      const asObjects = matrix.slice(headerIdx + 1).map((cells) => {
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          const key = h || `col_${i}`;
          obj[key] = cells[i] ?? "";
        });
        // Also keep positional values for freq sniffing
        cells.forEach((c, i) => {
          obj[`__${i}`] = c;
        });
        return obj;
      });
      const recovered = rowsFromParsed(asObjects, warnings);
      const recoveredNamed = recovered.filter((r) => !r.name.startsWith("CH "));
      if (
        recoveredNamed.length > rows.filter((r) => !r.name.startsWith("CH ")).length
      ) {
        rows = recovered;
      } else if (recovered.length > rows.length) {
        rows = recovered;
      }
    }
  }

  // Last resort: bare frequency tokens only
  if (rows.length === 0) {
    const bare = cleaned
      .split(/[\n,;\t]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of bare) {
      const frequencyMhz = parseFrequency(part);
      if (frequencyMhz == null) continue;
      rows.push({
        name: `CH ${frequencyMhz.toFixed(3)}`,
        frequencyMhz,
        band: null,
        type: null,
        groupChannel: null,
        zone: null,
        isBackup: false,
      });
    }
    if (rows.length) {
      warnings.push("Parsed as bare frequency list (no channel names found).");
    }
  }

  if (rows.length === 0) {
    warnings.push(
      "No frequency rows found. Export Inventory or Coordination as CSV from Workbench (not a .wwb project file).",
    );
  }

  return { rows, warnings };
}
