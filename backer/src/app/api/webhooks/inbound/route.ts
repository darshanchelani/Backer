import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { captureEvent } from "@/lib/analytics";
import { checkWebhookToken } from "@/lib/email/webhook-token";
import { ingestReply } from "@/lib/email/replies";
import { htmlToPlainText } from "@/lib/update-content";

interface Mailbox {
  Address?: string;
  Name?: string | null;
}

interface InboundItem {
  MessageId?: string;
  From?: Mailbox;
  To?: Mailbox[];
  Recipients?: Array<Mailbox | string>;
  Subject?: string;
  RawHtmlBody?: string | null;
  RawTextBody?: string | null;
  ExtractedMarkdownMessage?: string | null;
  SentAtDate?: string;
}

interface InboundPayload {
  items?: InboundItem[];
}

/**
 * Inbound replies land at reply+{trackToken}@INBOUND_DOMAIN (MX -> Brevo).
 * Brevo posts batches of parsed emails as { items: [...] }; we resolve each
 * token, classify sentiment, and record the reply.
 *
 * Brevo doesn't sign webhooks, so the URL carries a secret token
 * (`?token=...`). Idempotent per email via the Message-ID header.
 */
export async function POST(request: Request) {
  const auth = checkWebhookToken(request);
  if (!auth.configured && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
  }
  if (auth.configured && !auth.ok) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }

  const payload = await request.text();

  let parsed: InboundPayload;
  try {
    parsed = JSON.parse(payload) as InboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const items = Array.isArray(parsed.items) ? parsed.items : [];
  let processed = 0;
  let duplicates = 0;
  const failures: string[] = [];

  for (const item of items) {
    try {
      const result = await ingestItem(item);
      if (result === "duplicate") duplicates += 1;
      else processed += 1;
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (failures.length > 0) {
    // Non-2xx makes Brevo retry the batch; already-processed items dedupe.
    return NextResponse.json({ error: "Processing failed.", failures }, { status: 500 });
  }

  return NextResponse.json({ ok: true, processed, duplicates });
}

async function ingestItem(item: InboundItem): Promise<"processed" | "duplicate"> {
  const externalId =
    item.MessageId ?? `${item.From?.Address ?? "unknown"}:${item.SentAtDate ?? item.Subject ?? "unknown"}`;

  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_externalId: { provider: "brevo-inbound", externalId } },
  });
  if (existing) return "duplicate";

  const record = await prisma.webhookEvent.create({
    data: {
      provider: "brevo-inbound",
      externalId,
      type: "inboundEmailProcessed",
      payload: item as unknown as Prisma.InputJsonValue,
    },
  });

  const token = extractReplyToken(item.To, item.Recipients);
  const fromEmail = extractEmail(item.From?.Address ?? "");
  const body =
    item.ExtractedMarkdownMessage?.trim() ||
    item.RawTextBody?.trim() ||
    (item.RawHtmlBody ? htmlToPlainText(item.RawHtmlBody).trim() : "");

  if (token && fromEmail && body) {
    const receivedAt = parseDate(item.SentAtDate);
    const ingested = await ingestReply({
      trackToken: token,
      fromEmail,
      body,
      ...(receivedAt ? { receivedAt } : {}),
      raw: item,
    });
    if (!ingested) {
      console.warn("[webhooks/inbound] no EmailMessage for token:", token.slice(0, 8));
    } else {
      await captureEvent("reply_received", ingested.ownerClerkId, {
        company_id: ingested.companyId,
        update_id: ingested.updateId,
        sentiment: ingested.sentiment,
        classified_by: ingested.source,
      });
    }
  }

  await prisma.webhookEvent.update({ where: { id: record.id }, data: { processedAt: new Date() } });
  return "processed";
}

function extractReplyToken(
  to: Mailbox[] | undefined,
  recipients: Array<Mailbox | string> | undefined,
): string | null {
  const addresses: string[] = [];
  for (const mailbox of to ?? []) {
    if (mailbox?.Address) addresses.push(mailbox.Address);
  }
  for (const recipient of recipients ?? []) {
    if (typeof recipient === "string") addresses.push(recipient);
    else if (recipient?.Address) addresses.push(recipient.Address);
  }

  for (const address of addresses) {
    const match = address.match(/reply\+([A-Za-z0-9_-]+)@/i);
    if (match) return match[1];
  }
  return null;
}

function extractEmail(from: string): string | null {
  const angled = from.match(/<([^>]+)>/);
  const email = (angled ? angled[1] : from).trim().toLowerCase();
  return /.+@.+\..+/.test(email) ? email : null;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
