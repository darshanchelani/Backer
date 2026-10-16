import { z } from "zod";
import { NextResponse } from "next/server";
import { badRequest, handleApi, notFound, ok, parseJson } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ingestReply } from "@/lib/email/replies";

const schema = z.object({
  updateId: z.string().min(1),
  investorId: z.string().min(1).optional(),
  body: z.string().trim().min(1).max(4000),
});

/**
 * Dev-only: simulate an investor reply so the whole read-dashboard loop
 * (reply -> sentiment -> engagement) can be exercised without an inbound
 * email domain. Disabled in production.
 */
export async function POST(request: Request) {
  return handleApi(async () => {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Not available in production." }, { status: 404 });
    }
    const { company } = await requireApiCompany();
    const payload = await parseJson(request, schema);

    const update = await prisma.update.findFirst({
      where: { id: payload.updateId, companyId: company.id },
      select: { id: true },
    });
    if (!update) throw notFound("Update not found.");

    const message = await prisma.emailMessage.findFirst({
      where: { updateId: update.id, ...(payload.investorId ? { investorId: payload.investorId } : {}) },
      include: { investor: { select: { email: true } } },
      orderBy: { createdAt: "asc" },
    });
    if (!message) {
      throw badRequest("No email has been sent for that investor on this update yet.", "no_message");
    }

    const ingested = await ingestReply({
      trackToken: message.trackToken,
      fromEmail: message.investor?.email ?? "simulated@investor.test",
      body: payload.body,
      raw: { simulated: true },
    });
    if (!ingested) throw badRequest("Couldn't resolve the tracking token.", "no_message");

    return ok({ reply: ingested });
  });
}
