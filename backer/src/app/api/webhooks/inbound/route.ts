import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { captureEvent } from "@/lib/analytics";
import { verifySvixSignature } from "@/lib/email/svix";
import { ingestReply } from "@/lib/email/replies";
import { htmlToPlainText } from "@/lib/update-content";

interface InboundEvent {
  type?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[] | string;
    subject?: string;
    text?: string;
    html?: string;
  };
}

/**
 * Inbound replies land at reply+{trackToken}@INBOUND_DOMAIN.
 * We resolve the token, classify sentiment, and record the reply.
 */
export async function POST(request: Request) {
  const payload = await request.text();

  const hasSecret = Boolean(env.RESEND_WEBHOOK_SECRET);
  if (!hasSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
  }
  if (hasSecret) {
    const valid = verifySvixSignature({
      payload,
      secret: env.RESEND_WEBHOOK_SECRET!,
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signatureHeader: request.headers.get("svix-signature"),
    });
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }
  }

  let event: InboundEvent;
  try {
    event = JSON.parse(payload) as InboundEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const externalId =
    request.headers.get("svix-id") ??
    event.data?.email_id ??
    `${event.type ?? "inbound"}:${event.data?.from ?? "unknown"}:${event.data?.subject ?? ""}`;

  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_externalId: { provider: "resend-inbound", externalId } },
  });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const record = await prisma.webhookEvent.create({
    data: {
      provider: "resend-inbound",
      externalId,
      type: event.type ?? "email.received",
      payload: event as unknown as Prisma.InputJsonValue,
    },
  });

  try {
    const token = extractReplyToken(event.data?.to);
    const fromEmail = extractEmail(event.data?.from ?? "");
    const body =
      event.data?.text?.trim() ||
      (event.data?.html ? htmlToPlainText(event.data.html) : "");

    if (token && fromEmail && body) {
      const ingested = await ingestReply({
        trackToken: token,
        fromEmail,
        body,
        raw: event.data,
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
  } catch (err) {
    await prisma.webhookEvent.update({
      where: { id: record.id },
      data: { error: (err instanceof Error ? err.message : String(err)).slice(0, 500) },
    });
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function extractReplyToken(to: string[] | string | undefined): string | null {
  const addresses = Array.isArray(to) ? to : to ? [to] : [];
  for (const address of addresses) {
    const match = address.match(/reply\+([A-Za-z0-9_-]+)@/);
    if (match) return match[1];
  }
  return null;
}

function extractEmail(from: string): string | null {
  const angled = from.match(/<([^>]+)>/);
  const email = (angled ? angled[1] : from).trim().toLowerCase();
  return /.+@.+\..+/.test(email) ? email : null;
}
