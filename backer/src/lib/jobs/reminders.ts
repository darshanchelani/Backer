import { Resend } from "resend";
import { appUrl, capabilities, env } from "../env";
import { prisma } from "../db";
import { cadenceLabel, computeNextDue, reminderWindowStart } from "../cadence";
import { periodLabel } from "../format";

export interface ReminderRunSummary {
  companies: number;
  due: number;
  remindersSent: number;
  simulated: boolean;
  skipped: string[];
}

/**
 * The "never miss a month" engine. For every company with investors:
 * compute the due date from cadence, and if it's due and nothing has been
 * sent this window, email the founder a nudge with a one-click draft link.
 * Exactly-once per window via CadenceReminder's unique constraint.
 */
export async function runReminders(now = new Date()): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = {
    companies: 0,
    due: 0,
    remindersSent: 0,
    simulated: !capabilities.email,
    skipped: [],
  };

  const companies = await prisma.company.findMany({
    include: {
      owner: { select: { email: true, name: true } },
      updates: {
        where: { sentAt: { not: null } },
        orderBy: { sentAt: "desc" },
        take: 1,
        select: { sentAt: true },
      },
      _count: { select: { investors: true } },
    },
  });

  const resend = capabilities.email ? new Resend(env.RESEND_API_KEY) : null;

  for (const company of companies) {
    summary.companies += 1;

    if (company._count.investors === 0) {
      summary.skipped.push(`${company.name}: no investors`);
      continue;
    }

    const lastSentAt = company.updates[0]?.sentAt ?? null;
    const windowStart = reminderWindowStart(company.cadence, now);

    if (lastSentAt && lastSentAt >= windowStart) {
      summary.skipped.push(`${company.name}: already sent this window`);
      continue;
    }

    const due = computeNextDue({
      cadence: company.cadence,
      anchorDay: company.cadenceAnchorDay,
      lastSentAt,
      companyCreatedAt: company.createdAt,
    });
    if (due > now) {
      summary.skipped.push(`${company.name}: next due ${due.toISOString().slice(0, 10)}`);
      continue;
    }

    summary.due += 1;

    const alreadyReminded = await prisma.cadenceReminder.findUnique({
      where: { companyId_periodStart: { companyId: company.id, periodStart: windowStart } },
    });
    if (alreadyReminded) {
      summary.skipped.push(`${company.name}: already reminded this window`);
      continue;
    }

    // Prefer linking to an in-progress draft.
    const draft = await prisma.update.findFirst({
      where: { companyId: company.id, status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      select: { id: true, periodStart: true, periodEnd: true, currentVersion: true },
    });

    const period = draft
      ? periodLabel(draft.periodStart, draft.periodEnd)
      : periodLabel(windowStart, now);
    const draftUrl = draft ? appUrl(`/updates/${draft.id}`) : appUrl("/updates/new");
    const subject = draft
      ? `Your ${period} investor update is ready to finish`
      : `Time for your ${period} investor update`;

    const html = `
<div style="max-width:560px;margin:0 auto;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#374151;">
  <p>Hi ${company.owner.name?.split(" ")[0] ?? "there"},</p>
  <p>Your <strong>${cadenceLabel(company.cadence)}</strong> investor update is due.</p>
  <p>${
    draft
      ? "You already have a draft in progress - your numbers are pulled and it just needs your eyes."
      : "Your metrics are already pulled together, and the draft writes itself in about a minute."
  } Most founders send in under 20 minutes.</p>
  <p style="margin:24px 0;">
    <a href="${draftUrl}" style="background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;">${draft ? "Finish my draft" : "Draft my update"}</a>
  </p>
  <p style="font-size:13px;color:#9ca3af;">You're getting this because you set a ${cadenceLabel(company.cadence)} cadence in Backer. Change it any time in Settings.</p>
</div>`;

    const text = `Hi ${company.owner.name?.split(" ")[0] ?? "there"},\n\nYour ${cadenceLabel(company.cadence)} investor update is due.\n\n${
      draft ? "Finish your draft" : "Draft your update"
    }: ${draftUrl}\n\nYou're getting this because you set a ${cadenceLabel(company.cadence)} cadence in Backer.`;

    try {
      if (resend) {
        const { error } = await resend.emails.send({
          from: env.INBOUND_DOMAIN ? `Backer <reminders@${env.INBOUND_DOMAIN}>` : "Backer <onboarding@resend.dev>",
          to: [company.owner.email],
          subject,
          html,
          text,
        });
        if (error) throw new Error(error.message);
      } else {
        console.log(`[reminders] simulated reminder to ${company.owner.email}: ${subject}`);
      }

      await prisma.cadenceReminder.create({
        data: {
          companyId: company.id,
          updateId: draft?.id ?? null,
          periodStart: windowStart,
          periodEnd: now,
        },
      });
      summary.remindersSent += 1;
    } catch (err) {
      // Don't record the reminder - it will retry on the next run.
      console.error(`[reminders] failed for ${company.name}:`, err);
      summary.skipped.push(`${company.name}: send failed`);
    }
  }

  return summary;
}
