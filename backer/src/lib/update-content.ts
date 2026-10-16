/**
 * The 4-section update format is the heart of the product.
 * One source of truth for section keys, labels, and text <-> HTML conversion,
 * shared by the drafter, the editor, and the email renderer.
 */

export const SECTION_KEYS = ["wins", "metrics", "asks", "whatsNext"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  wins: "Wins",
  metrics: "Metrics",
  asks: "Asks",
  whatsNext: "What's next",
};

export const SECTION_HINTS: Record<SectionKey, string> = {
  wins: "What actually moved this month - shipped, closed, grew.",
  metrics: "The numbers, straight. We bold the labels for you.",
  asks: "Intros, hires, advice - be specific or don't ask.",
  whatsNext: "What the team is focused on before the next update.",
};

export type UpdateContent = Record<SectionKey, string>;

export function emptyContent(): UpdateContent {
  return { wins: "", metrics: "", asks: "", whatsNext: "" };
}

/** Defensively read content JSON out of the DB (Prisma `Json` is `unknown`). */
export function parseContent(json: unknown): UpdateContent {
  const content = emptyContent();
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const record = json as Record<string, unknown>;
    for (const key of SECTION_KEYS) {
      const value = record[key];
      if (typeof value === "string") content[key] = value;
    }
  }
  return content;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Strip markdown emphasis the model may sneak in - we render our own HTML. */
function clean(line: string): string {
  return line.replace(/\*\*/g, "").replace(/(^|\s)\*(?=\S)/g, "$1").trim();
}

/** `Label: value` -> `<strong>Label:</strong> value` when it looks like a metric line. */
function boldMetricLabel(line: string): string {
  const match = line.match(/^([A-Za-z][A-Za-z0-9 ()/%.-]{1,48}):\s*(.+)$/);
  if (!match) return escapeHtml(clean(line));
  return `<strong>${escapeHtml(match[1])}:</strong> ${escapeHtml(clean(match[2]))}`;
}

/**
 * Convert the drafter's plain-text output for one section into clean HTML
 * that the Tiptap editor and the email template can both render.
 */
export function textToSectionHtml(section: SectionKey, text: string): string {
  const trimmed = clean(text.trim());
  if (!trimmed) return "";

  const lines = trimmed
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (section === "metrics") {
    // One metric per line, bolded labels, tight vertical rhythm.
    return `<p>${lines.map(boldMetricLabel).join("<br>")}</p>`;
  }

  if (section === "asks") {
    const bullets = lines.filter((l) => /^[-*•]\s+/.test(l));
    if (bullets.length >= 1 && bullets.length >= lines.length - 1) {
      return `<ul>${bullets
        .map((l) => `<li>${escapeHtml(clean(l.replace(/^[-*•]\s+/, "")))}</li>`)
        .join("")}</ul>`;
    }
  }

  // Paragraphs separated by blank lines.
  return trimmed
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(clean(p)).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Plain-text flattening for previews, email text parts, and LLM context. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|h[1-6])>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isEmptyContent(content: UpdateContent): boolean {
  return SECTION_KEYS.every((k) => htmlToPlainText(content[k]).trim() === "");
}
