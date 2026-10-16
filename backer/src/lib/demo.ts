import {
  InvestorType,
  MetricKind,
  Provider,
  EmailStatus,
  EventType,
  Sentiment,
  VersionSource,
  Tone,
  type PrismaClient,
} from "@prisma/client";
import { newToken, hashIp } from "./crypto";

/**
 * Populates a company with realistic demo data so the full loop
 * (metrics -> draft -> send -> opens/clicks/replies -> sentiment) can be
 * exercised without live connectors.
 *
 * Section-by-section guards: fills in what's missing, never duplicates.
 */

// Deterministic PRNG so screenshots/demos are stable
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_INVESTORS: Array<{
  name: string;
  email: string;
  firm: string | null;
  type: InvestorType;
  opens: number;
  clicks: number;
  reply?: { body: string; sentiment: Sentiment; reason: string; daysAfter: number };
}> = [
  {
    name: "Maya Chen",
    email: "maya@northline.vc",
    firm: "Northline Capital",
    type: InvestorType.LEAD,
    opens: 3,
    clicks: 2,
  },
  {
    name: "Daniel Okafor",
    email: "daniel@northline.vc",
    firm: "Northline Capital",
    type: InvestorType.FOLLOW_ON,
    opens: 1,
    clicks: 0,
  },
  {
    name: "Sofia Martinez",
    email: "sofia@ascend.vc",
    firm: "Ascend Ventures",
    type: InvestorType.BOARD,
    opens: 4,
    clicks: 3,
    reply: {
      body: "Love the traction on self-serve signups - the activation improvements are clearly working. Would be great to dig into the churn cohort on our next call. Keep it up!",
      sentiment: Sentiment.POSITIVE,
      reason: "Explicit praise for traction and activation numbers; wanting to discuss further.",
      daysAfter: 1,
    },
  },
  {
    name: "James Park",
    email: "james.park.angel@gmail.com",
    firm: null,
    type: InvestorType.ANGEL,
    opens: 2,
    clicks: 1,
    reply: {
      body: "Thanks for the update. I'm a little concerned about the burn increase before the next milestone - are we still tracking to 18 months of runway? Happy to help think through the hiring plan.",
      sentiment: Sentiment.CONCERNED,
      reason: "Expresses concern about burn/runway and asks a follow-up question.",
      daysAfter: 2,
    },
  },
  {
    name: "Priya Raghavan",
    email: "priya@meridianfund.com",
    firm: "Meridian Fund",
    type: InvestorType.LEAD,
    opens: 1,
    clicks: 1,
  },
  {
    name: "Tom Alvarez",
    email: "tom@basiscapital.com",
    firm: "Basis Capital",
    type: InvestorType.FOLLOW_ON,
    opens: 0,
    clicks: 0,
  },
];

export async function populateDemoData(prisma: PrismaClient, companyId: string): Promise<void> {
  const rand = mulberry32(20261016);
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;

  // ── Investors ────────────────────────────────────────────────
  const existingInvestors = await prisma.investor.count({ where: { companyId } });
  if (existingInvestors === 0) {
    await prisma.investor.createMany({
      data: DEMO_INVESTORS.map((i) => ({
        companyId,
        name: i.name,
        email: i.email,
        firm: i.firm,
        type: i.type,
        notes: null,
      })),
    });
  }

  // ── Metric snapshots (Stripe 45d daily, HubSpot 6w weekly, Mixpanel 30d daily) ──
  const stripeCount = await prisma.metricSnapshot.count({ where: { companyId, provider: Provider.STRIPE } });
  if (stripeCount === 0) {
    const rows: Array<{
      companyId: string;
      provider: Provider;
      metric: MetricKind;
      value: number;
      currency?: string;
      unit?: string;
      periodStart: Date;
      periodEnd: Date;
    }> = [];

    for (let d = 45; d >= 0; d--) {
      const periodStart = new Date(now.getTime() - (d + 1) * day);
      const periodEnd = new Date(now.getTime() - d * day);
      const growth = (45 - d) * 118; // steady growth
      const wobble = Math.sin(d / 5) * 260;
      rows.push({
        companyId,
        provider: Provider.STRIPE,
        metric: MetricKind.MRR,
        value: Math.round(42500 + growth + wobble),
        currency: "USD",
        unit: "USD",
        periodStart,
        periodEnd,
      });
      const dow = periodStart.getDay();
      rows.push({
        companyId,
        provider: Provider.STRIPE,
        metric: MetricKind.NEW_CUSTOMERS,
        value: dow === 1 || dow === 2 ? 3 + Math.round(rand() * 3) : Math.round(rand() * 2),
        unit: "customers",
        periodStart,
        periodEnd,
      });
      if (rand() < 0.18) {
        rows.push({
          companyId,
          provider: Provider.STRIPE,
          metric: MetricKind.CHURNED_CUSTOMERS,
          value: 1,
          unit: "customers",
          periodStart,
          periodEnd,
        });
      }
      if (rand() < 0.08) {
        rows.push({
          companyId,
          provider: Provider.STRIPE,
          metric: MetricKind.REFUNDS,
          value: Math.round(120 + rand() * 300),
          currency: "USD",
          unit: "USD",
          periodStart,
          periodEnd,
        });
      }
    }

    for (let w = 5; w >= 0; w--) {
      const periodStart = new Date(now.getTime() - (w + 1) * 7 * day);
      const periodEnd = new Date(now.getTime() - w * 7 * day);
      rows.push(
        {
          companyId,
          provider: Provider.HUBSPOT,
          metric: MetricKind.PIPELINE_VALUE,
          value: Math.round(1810000 + (5 - w) * 62000 + rand() * 40000),
          currency: "USD",
          unit: "USD",
          periodStart,
          periodEnd,
        },
        {
          companyId,
          provider: Provider.HUBSPOT,
          metric: MetricKind.DEALS_OPEN,
          value: 30 + Math.round(rand() * 8),
          unit: "deals",
          periodStart,
          periodEnd,
        },
        {
          companyId,
          provider: Provider.HUBSPOT,
          metric: MetricKind.DEALS_WON,
          value: 1 + Math.round(rand() * 2),
          unit: "deals",
          periodStart,
          periodEnd,
        },
      );
    }

    for (let d = 30; d >= 0; d--) {
      const periodStart = new Date(now.getTime() - (d + 1) * day);
      const periodEnd = new Date(now.getTime() - d * day);
      const weekend = [0, 6].includes(periodStart.getDay()) ? 0.72 : 1;
      rows.push(
        {
          companyId,
          provider: Provider.MIXPANEL,
          metric: MetricKind.ACTIVE_USERS,
          value: Math.round((4650 + rand() * 420) * weekend),
          unit: "users",
          periodStart,
          periodEnd,
        },
        {
          companyId,
          provider: Provider.MIXPANEL,
          metric: MetricKind.NEW_SIGNUPS,
          value: Math.round((38 + rand() * 45) * weekend),
          unit: "signups",
          periodStart,
          periodEnd,
        },
        {
          companyId,
          provider: Provider.MIXPANEL,
          metric: MetricKind.EVENTS_TRACKED,
          value: Math.round((118000 + rand() * 24000) * weekend),
          unit: "events",
          periodStart,
          periodEnd,
        },
      );
    }

    // Manual metrics: one snapshot for the current month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    rows.push(
      {
        companyId,
        provider: Provider.MANUAL,
        metric: MetricKind.BURN,
        value: 64000,
        currency: "USD",
        unit: "USD/mo",
        periodStart: monthStart,
        periodEnd: now,
      },
      {
        companyId,
        provider: Provider.MANUAL,
        metric: MetricKind.CASH_ON_HAND,
        value: 1180000,
        currency: "USD",
        unit: "USD",
        periodStart: monthStart,
        periodEnd: now,
      },
      {
        companyId,
        provider: Provider.MANUAL,
        metric: MetricKind.RUNWAY_MONTHS,
        value: 18,
        unit: "months",
        periodStart: monthStart,
        periodEnd: now,
      },
    );

    await prisma.metricSnapshot.createMany({ data: rows });
  }

  // ── A sent update with opens, clicks, replies ────────────────
  const existingUpdates = await prisma.update.count({ where: { companyId } });
  if (existingUpdates === 0) {
    const sentAt = new Date(now.getTime() - 12 * day);
    const periodEnd = new Date(sentAt.getTime() - 2 * day);
    const periodStart = new Date(periodEnd.getTime() - 30 * day);
    const monthName = periodEnd.toLocaleString("en-US", { month: "long" });
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });

    const content = {
      wins: `<p>Self-serve signups grew <strong>41% month-over-month</strong>, and the activation redesign we shipped is clearly working - time-to-first-value is down to under 10 minutes.</p><p>We closed <strong>3 new team-plan customers</strong> including our largest logo to date, and shipped the integrations API.</p>`,
      metrics: `<p><strong>MRR:</strong> $48.2K (+9.4% MoM)<br><strong>New customers:</strong> 67<br><strong>Churn:</strong> 4 accounts (0.9%)<br><strong>Weekly active users:</strong> ~4.9K<br><strong>Pipeline:</strong> $2.1M across 34 open deals</p><p>Runway is <strong>18 months</strong> with $1.18M cash on hand.</p>`,
      asks: `<p>Two asks this month:</p><ul><li><strong>Intros to heads of platform at fintech companies</strong> - our new API is landing best with that profile.</li><li>If you know a strong <strong>senior backend engineer</strong> who wants to work on data infrastructure, we're hiring.</li></ul>`,
      whatsNext: `<p>Next month we're focused on the self-serve upgrade flow, SOC 2 Type I readiness, and shipping the first version of usage-based billing. We'll also open the waitlist for our mobile beta.</p>`,
    };

    const update = await prisma.update.create({
      data: {
        companyId,
        title: `${monthName} update`,
        subject: `${company.name} - ${monthName} update`,
        periodStart,
        periodEnd,
        status: "SENT",
        tone: Tone.MATTER_OF_FACT,
        currentVersion: 1,
        sentAt,
        fromName: company.senderName ?? "Ada Founder",
        fromEmail: company.senderEmail ?? "ada@northwind.dev",
        metricsContext: {
          demo: true,
          sources: ["STRIPE", "HUBSPOT", "MIXPANEL"],
          period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
        },
        versions: {
          create: {
            version: 1,
            content,
            source: VersionSource.AI_DRAFT,
            tone: Tone.MATTER_OF_FACT,
            model: "demo-seed",
          },
        },
      },
    });

    const investors = await prisma.investor.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
    const byEmail = new Map(investors.map((i) => [i.email, i]));

    for (const spec of DEMO_INVESTORS) {
      const investor = byEmail.get(spec.email);
      if (!investor) continue;

      const message = await prisma.emailMessage.create({
        data: {
          updateId: update.id,
          investorId: investor.id,
          trackToken: newToken(18),
          status: EmailStatus.DELIVERED,
          providerId: `demo-${update.id.slice(-6)}-${investor.id.slice(-6)}`,
          sentAt,
          deliveredAt: new Date(sentAt.getTime() + 40 * 1000),
          openCount: spec.opens,
          clickCount: spec.clicks,
          lastOpenedAt: spec.opens > 0 ? new Date(sentAt.getTime() + spec.opens * 3 * 60 * 60 * 1000) : null,
          lastClickedAt: spec.clicks > 0 ? new Date(sentAt.getTime() + spec.clicks * 5 * 60 * 60 * 1000) : null,
        },
      });

      const events: Array<{
        updateId: string;
        investorId: string;
        emailMessageId: string;
        type: EventType;
        url?: string;
        userAgent?: string;
        ipHash?: string;
        occurredAt: Date;
      }> = [
        {
          updateId: update.id,
          investorId: investor.id,
          emailMessageId: message.id,
          type: EventType.SENT,
          occurredAt: sentAt,
        },
        {
          updateId: update.id,
          investorId: investor.id,
          emailMessageId: message.id,
          type: EventType.DELIVERED,
          occurredAt: new Date(sentAt.getTime() + 40 * 1000),
        },
      ];

      for (let o = 1; o <= spec.opens; o++) {
        events.push({
          updateId: update.id,
          investorId: investor.id,
          emailMessageId: message.id,
          type: EventType.OPENED,
          userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15",
          ipHash: hashIp(`demo-open-${investor.id}-${o}`),
          occurredAt: new Date(sentAt.getTime() + o * 3 * 60 * 60 * 1000),
        });
      }
      for (let c = 1; c <= spec.clicks; c++) {
        events.push({
          updateId: update.id,
          investorId: investor.id,
          emailMessageId: message.id,
          type: EventType.CLICKED,
          url: c % 2 === 0 ? "https://northwind.dev/careers" : "https://northwind.dev/product/integrations",
          ipHash: hashIp(`demo-click-${investor.id}-${c}`),
          occurredAt: new Date(sentAt.getTime() + c * 5 * 60 * 60 * 1000),
        });
      }

      if (spec.reply) {
        const receivedAt = new Date(sentAt.getTime() + spec.reply.daysAfter * day);
        events.push({
          updateId: update.id,
          investorId: investor.id,
          emailMessageId: message.id,
          type: EventType.REPLIED,
          occurredAt: receivedAt,
        });
        await prisma.reply.create({
          data: {
            updateId: update.id,
            investorId: investor.id,
            emailMessageId: message.id,
            fromEmail: investor.email,
            body: spec.reply.body,
            sentiment: spec.reply.sentiment,
            sentimentConfidence: 0.92,
            sentimentReason: spec.reply.reason,
            receivedAt,
          },
        });
      }

      await prisma.updateEvent.createMany({ data: events });
    }

    // One pending draft for the CURRENT period so the "draft" flow has a starting point
    const currentPeriodEnd = now;
    const currentPeriodStart = new Date(now.getTime() - 30 * day);
    await prisma.update.create({
      data: {
        companyId,
        title: `${now.toLocaleString("en-US", { month: "long" })} update`,
        subject: `${company.name} - ${now.toLocaleString("en-US", { month: "long" })} update`,
        periodStart: currentPeriodStart,
        periodEnd: currentPeriodEnd,
        status: "DRAFT",
        tone: Tone.MATTER_OF_FACT,
        currentVersion: 0,
      },
    });

    // ── Voice samples (few-shot material for the drafter) ──────
    const sampleCount = await prisma.voiceSample.count({ where: { companyId } });
    if (sampleCount === 0) {
      await prisma.voiceSample.createMany({
        data: [
          {
            companyId,
            label: "Two months ago",
            content:
              "Team - quick update from Northwind. We crossed $41K MRR, up 7% on the month. The big win: our onboarding revamp cut activation time from 3 days to under 30 minutes. On the flip side, two mid-market renewals slipped to next month, so the pipeline number below is softer than it looks. Asks: intros to ops leads at logistics companies; feedback on our pricing page. Next month: closing the Series A process and shipping role-based permissions.",
          },
          {
            companyId,
            label: "Last month",
            content:
              "Hi all - Northwind here with the monthly. Revenue is at $44K MRR (+7.3%). We shipped the integrations API to beta and signed two design partners. Churn stayed under 1%. We're now 17 months of runway at current burn, and hiring one senior backend engineer. Asks: help finding that hire, and any warm intros to CFOs at 50-200 person SaaS companies for next quarter's enterprise push. Next: expand the beta, prep SOC 2.",
          },
        ],
      });
    }
  }
}
