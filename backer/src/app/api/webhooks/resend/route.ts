import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { verifySvixSignature } from "@/lib/email/svix";

interface ResendEvent {
  type?: string;
  data?: {
    email_id?: string;
    to?: string | string[];
    bounce?: { message?: string; type?: string };
  };
}

/**
 * Resend delivery webhooks: delivered / bounced / complained.
 * Svix-signed, idempotent via WebhookEvent, and per-event error tracking
 * so a poison event is visible instead of retrying forever.
 */
export async function POST(request: Request) {
  const payload = await request.text();

  if (!env.RESEND_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
  }

  const valid = verifySvixSignature({
    payload,
    secret: env.RESEND_WEBHOOK_SECRET,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signatureHeader: request.headers.get("svix-signature"),
  });
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(payload) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const externalId =
    request.headers.get("svix-id") ?? `${event.type ?? "unknown"}:${event.data?.email_id ?? "unknown"}`;

  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_externalId: { provider: "resend", externalId } },
  });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const record = await prisma.webhookEvent.create({
    data: {
      provider: "resend",
      externalId,
      type: event.type ?? "unknown",
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

async function handleEvent(event: ResendEvent): Promise<void> {
  const providerId = event.data?.email_id;
  if (!providerId || !event.type) return;

  const message = await prisma.emailMessage.findFirst({ where: { providerId } });
  if (!message) return; // not one of ours (or a provider id from another env)

  const now = new Date();

  switch (event.type) {
    case "email.delivered": {
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
    case "email.bounced": {
      await prisma.$transaction([
        prisma.emailMessage.update({
          where: { id: message.id },
          data: {
            status: "BOUNCED",
            bouncedAt: now,
            bounceReason: (event.data?.bounce?.message ?? "Bounced").slice(0, 500),
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
    case "email.complained": {
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
      return; // sent / delivery_delayed / etc - recorded in WebhookEvent, no state change
  }
}
