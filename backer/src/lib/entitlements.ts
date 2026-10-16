import type { Company, Plan } from "@prisma/client";
import { prisma } from "./db";
import { paymentRequired } from "./api";
import { startOfMonth } from "date-fns";

export interface PlanLimits {
  maxConnections: number | null;
  maxInvestors: number | null;
  updatesPerMonth: number | null;
  voiceSamples: number | null;
  sentiment: boolean;
}

/**
 * Pricing from the product spec:
 * - Free must stay useful forever (1 update/mo, 1 connector, 5 investors, no sentiment)
 * - Pro $49/mo is the "don't think about it" tier
 * - Scale $199/mo is the Series-B founder tier
 */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: { maxConnections: 1, maxInvestors: 5, updatesPerMonth: 1, voiceSamples: 1, sentiment: false },
  PRO: { maxConnections: 3, maxInvestors: 100, updatesPerMonth: null, voiceSamples: 5, sentiment: true },
  SCALE: { maxConnections: null, maxInvestors: null, updatesPerMonth: null, voiceSamples: 10, sentiment: true },
};

export const PLAN_META: Record<
  Plan,
  { name: string; priceMonthly: number; priceYearly: number | null; tagline: string; features: string[] }
> = {
  FREE: {
    name: "Free",
    priceMonthly: 0,
    priceYearly: null,
    tagline: "For your first few angels",
    features: [
      "1 update per month",
      "1 data connector",
      "Up to 5 investors",
      "Open tracking + read dashboard",
    ],
  },
  PRO: {
    name: "Pro",
    priceMonthly: 49,
    priceYearly: 468,
    tagline: "For raising founders",
    features: [
      "Unlimited updates",
      "3 data connectors (Stripe, HubSpot, Mixpanel)",
      "Up to 100 investors",
      "Reply sentiment + cooling-investor alerts",
      "Send from your own address",
    ],
  },
  SCALE: {
    name: "Scale",
    priceMonthly: 199,
    priceYearly: null,
    tagline: "For post-Series-A pipelines",
    features: [
      "Everything in Pro",
      "Unlimited connectors + investors",
      "Board deck export (soon)",
      "LP-forwardable variants (soon)",
      "CRM sync - Affinity / Attio (soon)",
    ],
  },
};

export function limitsFor(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}

export interface Usage {
  connections: number;
  investors: number;
  updatesThisMonth: number;
  voiceSamples: number;
}

export async function getUsage(companyId: string): Promise<Usage> {
  const [connections, investors, updatesThisMonth, voiceSamples] = await Promise.all([
    prisma.connection.count({ where: { companyId, status: { not: "REVOKED" } } }),
    prisma.investor.count({ where: { companyId } }),
    prisma.update.count({ where: { companyId, sentAt: { gte: startOfMonth(new Date()) } } }),
    prisma.voiceSample.count({ where: { companyId } }),
  ]);
  return { connections, investors, updatesThisMonth, voiceSamples };
}

const LIMIT_COPY: Record<keyof Usage, { noun: string; limit: (l: number) => string }> = {
  connections: { noun: "connector", limit: (l) => `${l} connector${l === 1 ? "" : "s"}` },
  investors: { noun: "investor", limit: (l) => `${l} investors` },
  updatesThisMonth: { noun: "update", limit: (l) => `${l} update${l === 1 ? "" : "s"} per month` },
  voiceSamples: { noun: "voice sample", limit: (l) => `${l} voice sample${l === 1 ? "" : "s"}` },
};

/**
 * Server-side gate. Call before creating the resource.
 * Throws 402 with an upgrade prompt when over the plan limit.
 */
export async function assertWithinLimit(company: Company, key: keyof Usage): Promise<void> {
  const limits = limitsFor(company.plan);
  const max =
    key === "connections"
      ? limits.maxConnections
      : key === "investors"
        ? limits.maxInvestors
        : key === "updatesThisMonth"
          ? limits.updatesPerMonth
          : limits.voiceSamples;

  if (max === null) return; // unlimited

  const usage = await getUsage(company.id);
  if (usage[key] >= max) {
    const copy = LIMIT_COPY[key];
    throw paymentRequired(
      `You've reached the ${PLAN_META[company.plan].name} plan limit of ${copy.limit(max)}. Upgrade to add more ${copy.noun}s.`,
      `limit:${key}`,
    );
  }
}
