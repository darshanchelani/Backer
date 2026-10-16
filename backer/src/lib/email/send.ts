import { Resend } from "resend";
import type { Company, Investor, Update } from "@prisma/client";
import { capabilities, env } from "../env";
import { prisma } from "../db";
import { newToken } from "../crypto";
import type { UpdateContent } from "../update-content";
import { renderUpdateEmail } from "./template";

export interface SendOutcome {
  sent: number;
  failed: number;
  skipped: number;
  simulated: boolean;
  errors: Array<{ email: string; error: string }>;
}

const SEND_CONCURRENCY = 8;

/**
 * The send engine. One EmailMessage per investor (the idempotency anchor),
 * per-message error isolation, and a simulated mode when RESEND_API_KEY
 * isn't set so the whole loop stays testable locally.
 */
export async function sendUpdateToInvestors(opts: {
  company: Company;
  update: Pick<Update, "id" | "periodStart" | "periodEnd">;
  subject: string;
  content: UpdateContent;
  investors: Array<Pick<Investor, "id" | "name" | "email">>;
}): Promise<SendOutcome> {
  const { company, update, subject, content, investors } = opts;
  const fromName = company.senderName ?? company.name;
  const fromEmail = company.senderEmail ?? "";
  const from = `${fromName} <${fromEmail}>`;

  const simulated = !capabilities.email;
  const resend = capabilities.email ? new Resend(env.RESEND_API_KEY) : null;

  const existing = await prisma.emailMessage.findMany({
    where: { updateId: update.id, investorId: { in: investors.map((i) => i.id) } },
  });
  const existingByInvestor = new Map(existing.map((m) => [m.investorId, m]));
  const priorSend = await prisma.update.findUniqueOrThrow({
    where: { id: update.id },
    select: { sentAt: true },
  });

  const outcome: SendOutcome = { sent: 0, failed: 0, skipped: 0, simulated, errors: [] };

  async function processOne(investor: Pick<Investor, "id" | "name" | "email">) {
    const previous = existingByInvestor.get(investor.id);

    // Never double-send: anything that already left the building is skipped.
    if (previous && previous.status !== "FAILED") {
      outcome.skipped += 1;
      return;
    }

    const trackToken = previous?.trackToken ?? newToken(18);
    const message = previous
      ? await prisma.emailMessage.update({
          where: { id: previous.id },
          data: { status: "QUEUED", error: null },
        })
      : await prisma.emailMessage.create({
          data: {
            updateId: update.id,
            investorId: investor.id,
            trackToken,
            status: "QUEUED",
          },
        });

    const replyTo = capabilities.inbound
      ? `reply+${trackToken}@${env.INBOUND_DOMAIN}`
      : fromEmail;

    const rendered = renderUpdateEmail({
      companyName: company.name,
      fromName,
      subject,
      content,
      trackToken,
      replyToHint: `Reply to this email to reach ${fromName} directly.`,
    });

    try {
      if (simulated || !resend) {
        await prisma.$transaction([
          prisma.emailMessage.update({
            where: { id: message.id },
            data: { status: "SENT", providerId: `sim-${message.id}`, sentAt: new Date() },
          }),
          prisma.updateEvent.create({
            data: {
              updateId: update.id,
              investorId: investor.id,
              emailMessageId: message.id,
              type: "SENT",
            },
          }),
        ]);
        outcome.sent += 1;
        return;
      }

      const { data, error } = await resend.emails.send({
        from,
        to: [investor.email],
        subject,
        html: rendered.html,
        text: rendered.text,
        replyTo,
      });

      if (error || !data) {
        throw new Error(error?.message ?? "Resend rejected the message.");
      }

      await prisma.$transaction([
        prisma.emailMessage.update({
          where: { id: message.id },
          data: { status: "SENT", providerId: data.id, sentAt: new Date() },
        }),
        prisma.updateEvent.create({
          data: {
            updateId: update.id,
            investorId: investor.id,
            emailMessageId: message.id,
            type: "SENT",
          },
        }),
      ]);
      outcome.sent += 1;
    } catch (err) {
      const message_ = err instanceof Error ? err.message : "Unknown send failure.";
      await prisma.emailMessage.update({
        where: { id: message.id },
        data: { status: "FAILED", error: message_.slice(0, 500) },
      });
      outcome.failed += 1;
      outcome.errors.push({ email: investor.email, error: message_ });
    }
  }

  for (let i = 0; i < investors.length; i += SEND_CONCURRENCY) {
    const chunk = investors.slice(i, i + SEND_CONCURRENCY);
    await Promise.allSettled(chunk.map((investor) => processOne(investor)));
  }

  const anySuccess = outcome.sent > 0 || outcome.skipped > 0;
  await prisma.update.update({
    where: { id: update.id },
    data: {
      status: anySuccess ? "SENT" : "FAILED",
      sentAt: anySuccess ? (priorSend.sentAt ?? new Date()) : null,
      fromName,
      fromEmail,
      subject,
    },
  });

  return outcome;
}
