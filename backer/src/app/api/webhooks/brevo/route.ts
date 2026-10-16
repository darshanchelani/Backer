import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkWebhookToken } from "@/lib/email/webhook-token";

interface BrevoEvent {
  event?: string;
  email?: string;
  id?: number;
  "message-id"?: string;
  ts_event?: number;
  reason?: string;
  "X-Mailin-custom"?: string;
}

/**
 * Brevo transactional webhooks: delivered / bounced / spam.
 *
 * Brevo doesn't sign webhooks, so the URL carries a secret token
 * (`?token=...`). Idempotent via WebhookEvent, and per-event error tracking
 * so a poison event is visible instead of retrying forever.
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

  let event: BrevoEvent;
  try {
    event = JSON.parse(payload) as BrevoEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const externalId = `${event.event ?? "unknown"}:${event["message-id"] ?? event.email ?? "unknown"}:${
    event.ts_event ?? "0"
  }`;

  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_externalId: { provider: "brevo", externalId } },
  });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const record = await prisma.webhookEvent.create({
    data: {
      provider: "brevo",
      externalId,
      type: event.event ?? "unknown",
      payload: event as unknown as Prisma.InputJsonValue,
    },
  });

  try {
    await handleEvent(event);
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

async function handleEvent(event: BrevoEvent): Promise<void> {
  if (!event.event) return;

  const message = await findMessage(event);
  if (!message) return; // not one of ours (or a provider id from another env)

  const now = new Date();

  switch (event.event) {
    case "delivered": {
      await prisma.$transaction([
        prisma.emailMessage.update({
          where: { id: message.id },
          data: { status: "DELIVERED", deliveredAt: message.deliveredAt ?? now },
        }),
        prisma.updateEvent.create({
          data: {
            updateId: message.updateId,
            investorId: message.investorId,
            emailMessageId: message.id,
            type: "DELIVERED",
          },
        }),
      ]);
      return;
    }
    case "hard_bounce":
    case "soft_bounce":
    case "invalid_email":
    case "blocked":
    case "error": {
      await prisma.$transaction([
        prisma.emailMessage.update({
          where: { id: message.id },
          data: {
            status: "BOUNCED",
            bouncedAt: now,
            bounceReason: (event.reason ?? `Brevo: ${event.event}`).slice(0, 500),
          },
        }),
        prisma.updateEvent.create({
          data: {
            updateId: message.updateId,
            investorId: message.investorId,
            emailMessageId: message.id,
            type: "BOUNCED",
          },
        }),
      ]);
      return;
    }
    case "spam": {
      await prisma.$transaction([
        prisma.emailMessage.update({ where: { id: message.id }, data: { status: "COMPLAINED" } }),
        prisma.updateEvent.create({
          data: {
            updateId: message.updateId,
            investorId: message.investorId,
            emailMessageId: message.id,
            type: "COMPLAINED",
          },
        }),
      ]);
      return;
    }
    default:
      return; // request / opened / click / deferred / unsubscribed - recorded, no state change
  }
}

/**
 * Match the webhook back to our EmailMessage: first by the X-Mailin-custom
 * correlation id we set at send time, then by provider message id (Brevo
 * reports it with or without angle brackets depending on the event).
 */
async function findMessage(event: BrevoEvent) {
  const correlationId = event["X-Mailin-custom"];
  if (correlationId) {
    const byCorrelation = await prisma.emailMessage.findUnique({ where: { id: correlationId } });
    if (byCorrelation) return byCorrelation;
  }

  const messageId = event["message-id"];
  if (!messageId) return null;

  const normalized = messageId.replace(/[<>]/g, "");
  return prisma.emailMessage.findFirst({
    where: {
      OR: [{ providerId: messageId }, { providerId: normalized }, { providerId: `<${normalized}>` }],
    },
  });
}
