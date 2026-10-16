import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { classifyReply } from "../ai/sentiment";

export interface IngestedReply {
  id: string;
  updateId: string;
  investorId: string | null;
  sentiment: string;
  source: "ai" | "keywords";
}

/**
 * One path for every inbound reply (real webhook or dev simulation):
 * resolve the tracking token to its EmailMessage, classify sentiment,
 * and record the Reply + REPLIED event atomically.
 */
export async function ingestReply(opts: {
  trackToken: string;
  fromEmail: string;
  body: string;
  receivedAt?: Date;
  raw?: unknown;
}): Promise<IngestedReply | null> {
  const message = await prisma.emailMessage.findUnique({
    where: { trackToken: opts.trackToken },
    select: { id: true, updateId: true, investorId: true },
  });
  if (!message) return null;

  const sentiment = await classifyReply(opts.body);
  const receivedAt = opts.receivedAt ?? new Date();

  const reply = await prisma.$transaction(async (tx) => {
    const created = await tx.reply.create({
      data: {
        updateId: message.updateId,
        investorId: message.investorId,
        emailMessageId: message.id,
        fromEmail: opts.fromEmail,
        body: opts.body.slice(0, 20000),
        sentiment: sentiment.sentiment,
        sentimentConfidence: sentiment.confidence,
        sentimentReason: sentiment.reason,
        raw: opts.raw === undefined ? undefined : (opts.raw as Prisma.InputJsonValue),
        receivedAt,
      },
    });
    await tx.updateEvent.create({
      data: {
        updateId: message.updateId,
        investorId: message.investorId,
        emailMessageId: message.id,
        type: "REPLIED",
        occurredAt: receivedAt,
      },
    });
    return created;
  });

  return {
    id: reply.id,
    updateId: reply.updateId,
    investorId: reply.investorId,
    sentiment: reply.sentiment,
    source: sentiment.source,
  };
}
