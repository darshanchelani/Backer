import Papa from "papaparse";
import type { InvestorInput } from "./schemas";

/**
 * Parses pasted/uploaded investor lists: "Name, Email, Firm, Type" per line.
 * Headers optional. Used by onboarding and the import dialog.
 */

export type InvestorTypeValue = InvestorInput["type"];

function normalizeType(raw: string): InvestorTypeValue {
  const s = raw.toLowerCase();
  if (s.includes("lead")) return "LEAD";
  if (s.includes("board")) return "BOARD";
  if (s.includes("follow")) return "FOLLOW_ON";
  if (s.includes("angel")) return "ANGEL";
  return "OTHER";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseInvestorText(text: string): { rows: InvestorInput[]; invalid: number } {
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], invalid: 0 };

  const firstLine = trimmed.split(/\r?\n/)[0] ?? "";
  const hasHeader = /name/i.test(firstLine) && /e-?mail/i.test(firstLine);
  const parsed = Papa.parse<string[]>(trimmed, { skipEmptyLines: true });
  const lines = parsed.data;
  const start = hasHeader ? 1 : 0;

  const rows: InvestorInput[] = [];
  let invalid = 0;

  for (let i = start; i < lines.length; i++) {
    const cells = (lines[i] ?? []).map((c) => (c ?? "").trim());
    if (cells.every((c) => !c)) continue;

    const name = cells[0] ?? "";
    const email = (cells[1] ?? "").toLowerCase();
    const firm = cells[2] || undefined;
    const type = normalizeType(cells[3] ?? "");

    if (!name || !EMAIL_RE.test(email)) {
      invalid++;
      continue;
    }
    rows.push({ name, email, firm, type, notes: undefined });
  }

  const seen = new Set<string>();
  const dedup: InvestorInput[] = [];
  for (const r of rows) {
    if (!seen.has(r.email)) {
      seen.add(r.email);
      dedup.push(r);
    }
  }
  return { rows: dedup, invalid };
}
