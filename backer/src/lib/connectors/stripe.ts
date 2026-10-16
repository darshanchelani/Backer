import Stripe from "stripe";
import { subDays } from "date-fns";
import type { Connector, HealthResult, MetricPoint, SyncResult } from "./types";
import { errMessage } from "./types";

/**
 * Stripe connector. Works with either a Standard OAuth access token or,
 * for local/simple setups, a read-only restricted API key (rk_...).
 */
async function collectAll<T>(
  fetchPage: (startingAfter?: string) => Promise<Stripe.ApiList<T>>,
  maxPages = 8,
): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(after);
    out.push(...page.data);
    if (!page.has_more) break;
    const last = page.data[page.data.length - 1] as { id?: string } | undefined;
    if (!last?.id) break;
    after = last.id;
  }
  return out;
}

/** Monthly value in dollars for one unit of a Stripe price. */
function monthlyAmount(price: Stripe.Price): number {
  const cents = price.unit_amount ?? 0;
  const recurring = price.recurring;
  const interval = recurring?.interval ?? "month";
  const every = recurring?.interval_count ?? 1;
  let perMonth: number;
  switch (interval) {
    case "day":
      perMonth = cents * (30 / every);
      break;
    case "week":
      perMonth = cents * (52 / 12 / every);
      break;
    case "year":
      perMonth = cents / (12 * every);
      break;
    default:
      perMonth = cents / every;
  }
  return perMonth / 100;
}

export const stripeConnector: Connector = {
  provider: "STRIPE",

  async checkHealth(token): Promise<HealthResult> {
    try {
      const stripe = new Stripe(token);
      try {
        const account = await stripe.accounts.retrieveCurrent();
        return {
          ok: true,
          accountLabel: account.settings?.dashboard?.display_name ?? account.id,
        };
      } catch {
        // Restricted keys can't read the account object - a light list call is enough
        await stripe.subscriptions.list({ limit: 1 });
        return { ok: true, accountLabel: "Stripe account" };
      }
    } catch (err) {
      return { ok: false, error: campaign(errMessage(err), "Stripe") };
    }
  },

  async sync(token, { days }): Promise<SyncResult> {
    const stripe = new Stripe(token);
    const now = new Date();
    const sinceUnix = Math.floor(subDays(now, days).getTime() / 1000);
    const points: MetricPoint[] = [];
    let accountLabel: string | undefined;
    let externalAccountId: string | undefined;

    try {
      const account = await stripe.accounts.retrieveCurrent();
      externalAccountId = account.id;
      accountLabel = account.settings?.dashboard?.display_name ?? account.id;
    } catch {
      // fine - restricted keys
    }

    // MRR from active subscriptions
    const activeSubs = await collectAll((after) =>
      stripe.subscriptions.list({
        status: "active",
        limit: 100,
        expand: ["data.items.data.price"],
        ...(after ? { starting_after: after } : {}),
      }),
    );
    let mrr = 0;
    for (const sub of activeSubs) {
      for (const item of sub.items.data) {
        mrr += monthlyAmount(item.price) * (item.quantity ?? 1);
      }
    }
    points.push({ metric: "MRR", value: Math.round(mrr), currency: "USD", unit: "USD" });

    // New customers (subscriptions created in the window)
    const createdSubs = await collectAll((after) =>
      stripe.subscriptions.list({
        created: { gte: sinceUnix },
        limit: 100,
        ...(after ? { starting_after: after } : {}),
      }),
    );
    points.push({ metric: "NEW_CUSTOMERS", value: createdSubs.length, unit: "customers" });

    // Churned customers (canceled in the window)
    const canceledSubs = await collectAll((after) =>
      stripe.subscriptions.list({
        status: "canceled",
        limit: 100,
        ...(after ? { starting_after: after } : {}),
      }),
    );
    const churned = canceledSubs.filter((s) => (s.canceled_at ?? 0) >= sinceUnix).length;
    points.push({ metric: "CHURNED_CUSTOMERS", value: churned, unit: "customers" });

    // Revenue (charge balance transactions in the window)
    const txs = await collectAll((after) =>
      stripe.balanceTransactions.list({
        created: { gte: sinceUnix },
        limit: 100,
        ...(after ? { starting_after: after } : {}),
      }),
    );
    const revenueCents = txs
      .filter((t) => t.type === "charge" && t.status !== "failed")
      .reduce((sum, t) => sum + t.amount, 0);
    points.push({
      metric: "REVENUE",
      value: Math.round(revenueCents / 100),
      currency: "USD",
      unit: "USD",
    });

    // Refunds in the window
    const refunds = await collectAll((after) =>
      stripe.refunds.list({
        created: { gte: sinceUnix },
        limit: 100,
        ...(after ? { starting_after: after } : {}),
      }),
    );
    const refundCents = refunds.reduce((sum, r) => sum + r.amount, 0);
    points.push({
      metric: "REFUNDS",
      value: Math.round(refundCents / 100),
      currency: "USD",
      unit: "USD",
    });

    return { points, accountLabel, externalAccountId };
  },
};

/** Make auth errors actionable instead of cryptic. */
function campaign(message: string, provider: string): string {
  if (/api[_ ]?key|401|invalid/i.test(message)) {
    return `${provider} rejected that key (${message}). Use a read-only restricted key (rk_...) from Dashboard > Developers > API keys.`;
  }
  return `${provider}: ${message}`;
}
