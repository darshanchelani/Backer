import { appUrl } from "../env";
import { SECTION_KEYS, SECTION_LABELS, htmlToPlainText, type UpdateContent } from "../update-content";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Investor updates go to people who matter. Keep the email boring in the
 * best way: readable in every client, no images besides the tracking pixel,
 * links that survive click-tracking, and a reply-to that lands in the
 * founder's inbox.
 */

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Wrap every http(s) link so clicks flow through our tracker. */
function rewriteLinks(html: string, token: string): string {
  return html.replace(
    /<a\s+([^>]*?)href=(["'])(.*?)\2([^>]*)>/gi,
    (match, pre: string, _quote: string, href: string, post: string) => {
      if (/^(mailto:|#)/i.test(href)) return match;
      const tracked = `${appUrl(`/api/track/click/${token}`)}?u=${encodeURIComponent(href)}`;
      return `<a ${pre}href="${escapeAttr(tracked)}"${post}>`;
    },
  );
}

const CONTENT_STYLES = `
  .be p { margin: 0 0 14px; line-height: 1.65; }
  .be ul { margin: 0 0 14px; padding-left: 20px; }
  .be li { margin: 0 0 6px; line-height: 1.65; }
  .be strong { color: #111827; }
  .be a { color: #1d4ed8; }
`;

export function renderUpdateEmail(opts: {
  companyName: string;
  fromName: string;
  subject: string;
  content: UpdateContent;
  trackToken: string;
  replyToHint?: string;
}): RenderedEmail {
  const sectionsHtml = SECTION_KEYS.filter((key) => htmlToPlainText(opts.content[key]).trim() !== "")
    .map(
      (key) => `
      <h2 style="margin:26px 0 10px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">${SECTION_LABELS[key]}</h2>
      ${rewriteLinks(opts.content[key], opts.trackToken)}`,
    )
    .join("\n");

  const pixel = `<img src="${appUrl(`/api/track/open/${opts.trackToken}`)}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${CONTENT_STYLES}</style>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
  <div style="max-width:600px;margin:0 auto;padding:24px 12px;">
    <div class="be" style="background-color:#ffffff;border-radius:8px;padding:32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#374151;">
      ${sectionsHtml}
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#9ca3af;">
        <p style="margin:0 0 6px;">${escapeAttr(opts.fromName)} &middot; ${escapeAttr(opts.companyName)}</p>
        ${opts.replyToHint ? `<p style="margin:0 0 6px;">${escapeAttr(opts.replyToHint)}</p>` : ""}
        <p style="margin:0;">Sent with <a href="${appUrl("/")}" style="color:#9ca3af;">Backer</a>.</p>
      </div>
    </div>
  </div>
  ${pixel}
</body>
</html>`;

  const textSections = SECTION_KEYS.filter((key) => htmlToPlainText(opts.content[key]).trim() !== "")
    .map((key) => `${SECTION_LABELS[key].toUpperCase()}\n${htmlToPlainText(opts.content[key])}`)
    .join("\n\n");

  const text = `${textSections}\n\n--\n${opts.fromName} - ${opts.companyName}${
    opts.replyToHint ? `\n${opts.replyToHint}` : ""
  }`;

  return { subject: opts.subject, html, text };
}

/** Lightweight preview for the send screen - same content, no tracking. */
export function renderPreviewSections(content: UpdateContent): Array<{ label: string; html: string }> {
  return SECTION_KEYS.filter((key) => htmlToPlainText(content[key]).trim() !== "").map((key) => ({
    label: SECTION_LABELS[key],
    html: content[key],
  }));
}
