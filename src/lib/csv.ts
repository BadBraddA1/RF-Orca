import Papa from "papaparse";
import type { ParsedChannelRow } from "./types";

function parseFrequency(raw: string): number | null {
  const cleaned = raw.replace(/mhz/i, "").replace(/,/g, "").trim();
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  // RF mics live roughly 470–698 MHz (US TV band) plus some IFB/comms;
  // reject tiny integers that aren't frequencies (e.g. "74" from "Primary frequencies (74)").
  if (value < 100 || value > 1000) return null;
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

/**
 * Shure Workbench "Coordination report" paste/export — multi-space columns:
 *   AD/Standard  G57+  BK 01  G:-- Ch:--  521.675 MHz
 *   ULXD/Standard  G50    G:-- Ch:--  533.125 MHz
 *   ULXD/Standard  H50  Shure  G:-- Ch:--  534.975 MHz
 */
const COORD_ROW_RE =
  /^([A-Za-z0-9]+)\/([A-Za-z0-9]+)\s+([A-Z]\d+\+?)\s+(.*?)\s+(G:\S*\s+Ch:\S*)\s+(\d+(?:\.\d+)?)\s*MHz\s*$/i;

function looksLikeCoordinationReport(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes("coordination report")) return true;
  if (lower.includes("primary frequencies")) return true;
  if (lower.includes("rf zone:")) return true;
  const lines = splitLines(text);
  let hits = 0;
  for (const line of lines.slice(0, 80)) {
    if (COORD_ROW_RE.test(line.trim())) hits += 1;
  }
  return hits >= 3;
}

function parseCoordinationReport(text: string): {
  rows: ParsedChannelRow[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const rows: ParsedChannelRow[] = [];
  let currentZone: string | null = null;
  let currentIsBackup = false;
  let inBackup = false;

  for (const rawLine of splitLines(text)) {
    const line = rawLine.trim().replace(/^"+|"+$/g, "");
    if (!line) continue;
    const lower = line.toLowerCase();

    if (/^rf zone:\s*(.+)$/i.test(line)) {
      currentZone = line.replace(/^rf zone:\s*/i, "").trim() || null;
      continue;
    }
    if (lower.includes("backup frequencies")) {
      inBackup = true;
      currentIsBackup = true;
      continue;
    }
    if (lower.includes("primary frequencies")) {
      inBackup = false;
      currentIsBackup = false;
      continue;
    }
    // Skip section titles / column headers
    if (
      lower.startsWith("coordination") ||
      lower.startsWith("type") ||
      lower.includes("inclusion group") ||
      lower.includes("channel name")
    ) {
      continue;
    }

    const m = line.match(COORD_ROW_RE);
    if (!m) continue;

    const type = `${m[1]}/${m[2]}`;
    const band = m[3];
    const nameRaw = m[4].trim();
    const groupChannel = m[5].replace(/\s+/g, " ").trim();
    const frequencyMhz = parseFrequency(m[6]);
    if (frequencyMhz == null) continue;

    rows.push({
      name: nameRaw || `CH ${frequencyMhz.toFixed(3)}`,
      frequencyMhz,
      band,
      type,
      groupChannel,
      zone: currentZone,
      isBackup: inBackup || currentIsBackup,
    });
  }

  if (rows.length) {
    const primary = rows.filter((r) => !r.isBackup).length;
    const backup = rows.length - primary;
    warnings.push(
      backup > 0
        ? `Parsed Workbench coordination report (${primary} primary, ${backup} backup).`
        : `Parsed Workbench coordination report (${rows.length} channels).`,
    );
  }
  return { rows, warnings };
}

function rowsFromParsed(data: Record<string, unknown>[]): ParsedChannelRow[] {
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
 * Parses Shure WWB inventory CSV or Coordination report text.
 */
export function parseWwbCsv(text: string): {
  rows: ParsedChannelRow[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const cleaned = text.replace(/^\uFEFF/, "");

  // Prefer coordination-report layout when it matches (space columns + MHz).
  if (looksLikeCoordinationReport(cleaned)) {
    const report = parseCoordinationReport(cleaned);
    if (report.rows.length > 0) {
      return report;
    }
    warnings.push(
      ...report.warnings,
      "Looked like a coordination report but no frequency rows matched.",
    );
  }

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

  const usefulErrors = parsed.errors.filter(
    (e) => !/too many fields/i.test(e.message || ""),
  );
  if (usefulErrors.length) {
    warnings.push(
      ...usefulErrors.slice(0, 5).map((e) => e.message || "CSV parse issue"),
    );
  }

  let rows = rowsFromParsed(parsed.data);

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
          obj[h || `col_${i}`] = cells[i] ?? "";
        });
        cells.forEach((c, i) => {
          obj[`__${i}`] = c;
        });
        return obj;
      });
      const recovered = rowsFromParsed(asObjects);
      const recoveredNamed = recovered.filter((r) => !r.name.startsWith("CH "));
      if (
        recoveredNamed.length >
        rows.filter((r) => !r.name.startsWith("CH ")).length
      ) {
        rows = recovered;
      } else if (recovered.length > rows.length) {
        rows = recovered;
      }
    }
  }

  // Try coordination parser even if header sniff missed (e.g. weird export).
  if (rows.length === 0 || rows.every((r) => r.name.startsWith("CH "))) {
    const report = parseCoordinationReport(cleaned);
    if (
      report.rows.length > rows.length ||
      report.rows.some((r) => !r.name.startsWith("CH "))
    ) {
      return {
        rows: report.rows,
        warnings: [...warnings, ...report.warnings],
      };
    }
  }

  // Last resort: tokens that look like "518.200 MHz" only (not bare "74").
  if (rows.length === 0) {
    const mhzTokens = cleaned.match(/\d{3}(?:\.\d+)?\s*MHz/gi) ?? [];
    for (const token of mhzTokens) {
      const frequencyMhz = parseFrequency(token);
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
      "No frequency rows found. Paste a Workbench Coordination report or export Inventory/Coordination as CSV.",
    );
  }

  return { rows, warnings };
}
