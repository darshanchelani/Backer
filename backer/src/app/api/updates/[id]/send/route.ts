import { z } from "zod";
import { badRequest, conflict, handleApi, notFound, ok, parseJson } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertWithinLimit } from "@/lib/entitlements";
import { periodLabel } from "@/lib/format";
import { isEmptyContent, parseContent } from "@/lib/update-content";
import { sendUpdateToInvestors } from "@/lib/email/send";

const bodySchema = z.object({
  investorIds: z.array(z.string().min(1)).min(1).max(1000).optional(),
  subject: z.string().trim().max(200).optional(),
});

/**
 * Send (or retry) an update. Idempotent per investor: anyone who already
 * received it is skipped, failures can be retried by sending again.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { company } = await requireApiCompany();
    const { id } = await params;
    const body = await parseJson(request, bodySchema);

    const update = await prisma.update.findFirst({
      where: { id, companyId: company.id },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!update) throw notFound("Update not found.");
    if (update.status === "SENDING") {
      throw conflict("A send is already in progress for this update.");
    }

    const content = parseContent(update.versions[0]?.content);
    if (isEmptyContent(content)) {
      throw badRequest("This update is empty - draft or write something first.");
    }

    const subject =
      body.subject ??
      update.subject ??
      `${company.name} - ${periodLabel(update.periodStart, update.periodEnd)} update`;

    if (!company.senderEmail) {
      throw badRequest(
        "Add your sending address in Settings before sending - investors reply to you, not to a robot.",
        "no_sender",
      );
    }

    // The monthly update limit applies to the first send, not to retries.
    if (!update.sentAt) {
      await assertWithinLimit(company, "updatesThisMonth");
    }

    const investors = await prisma.investor.findMany({
      where: {
        companyId: company.id,
        ...(body.investorIds ? { id: { in: body.investorIds } } : {}),
      },
      orderBy: { name: "asc" },
    });
    if (investors.length === 0) {
      throw badRequest("Pick at least one investor to send to.");
    }

    if (!update.sentAt) {
      await prisma.update.update({ where: { id: update.id }, data: { status: "SENDING" } });
    }

    let outcome;
    try {
      outcome = await sendUpdateToInvestors({
        company,
        update,
        subject,
        content,
        investors: investors.map((i) => ({ id: i.id, name: i.name, email: i.email })),
      });
    } catch (err) {
      // Never leave an update stuck in SENDING.
      await prisma.update.update({
        where: { id: update.id },
        data: { status: update.sentAt ? "SENT" : "DRAFT" },
      });
      throw err;
    }

    return ok({
      ...outcome,
      subject,
      sentAt: update.sentAt ?? (outcome.sent > 0 ? new Date().toISOString() : null),
    });
  });
}
