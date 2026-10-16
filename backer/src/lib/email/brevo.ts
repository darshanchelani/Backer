import { env } from "../env";

const BREVO_API_BASE = "https://api.brevo.com/v3";

export interface BrevoSendResult {
  messageId: string;
}

/**
 * Send one transactional email through Brevo (REST v3).
 *
 * `correlationId` is echoed back as the `X-Mailin-custom` field in Brevo
 * webhooks, which is how we map delivery events to our EmailMessage rows.
 */
export async function sendBrevoEmail(opts: {
  to: { email: string; name?: string | null };
  from: { email: string; name: string };
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  correlationId?: string;
}): Promise<BrevoSendResult> {
  const apiKey = env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY is not set.");

  const payload = {
    sender: { email: opts.from.email, name: opts.from.name },
    to: [{ email: opts.to.email, ...(opts.to.name ? { name: opts.to.name } : {}) }],
    subject: opts.subject,
    htmlContent: opts.html,
    ...(opts.text ? { textContent: opts.text } : {}),
    ...(opts.replyTo ? { replyTo: { email: opts.replyTo } } : {}),
    ...(opts.correlationId ? { headers: { "X-Mailin-custom": opts.correlationId } } : {}),
  };

  const res = await fetch(`${BREVO_API_BASE}/smtp/email`, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });

  const data = (await res.json().catch(() => null)) as {
    messageId?: string;
    code?: string;
    message?: string;
  } | null;

  if (!res.ok || !data?.messageId) {
    const detail = data?.message ?? `HTTP ${res.status}`;
    throw new Error(`Brevo rejected the message${data?.code ? ` (${data.code})` : ""}: ${detail}`);
  }

  return { messageId: data.messageId };
}
