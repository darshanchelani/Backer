import Stripe from "stripe";
import type { Plan } from "@prisma/client";
import { capabilities, env } from "./env";

export const PAID_PLANS = ["PRO", "SCALE"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

export function stripeClient(): Stripe | null {
  if (!capabilities.billing) return null;
  return new Stripe(env.STRIPE_SECRET_KEY!);
}

export function priceIdForPlan(plan: PaidPlan): string | null {
  return plan === "PRO"
    ? env.NEXT_PUBLIC_STRIPE_PRICE_PRO ?? null
    : env.NEXT_PUBLIC_STRIPE_PRICE_SCALE ?? null;
}

export function planForPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  if (priceId === env.NEXT_PUBLIC_STRIPE_PRICE_PRO) return "PRO";
  if (priceId === env.NEXT_PUBLIC_STRIPE_PRICE_SCALE) return "SCALE";
  return null;
}

/**
 * Subscription period end lives on the subscription item in current
 * Stripe API versions (it moved off the subscription object).
 */
export function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const item = subscription.items.data[0];
  return item?.current_period_end ? new Date(item.current_period_end * 1000) : null;
}

export function subscriptionPriceId(subscription: Stripe.Subscription): string | null {
  return subscription.items.data[0]?.price?.id ?? null;
}

/** Active-ish statuses that should keep the paid plan. */
export function subscriptionKeepsPlan(status: Stripe.Subscription.Status): boolean {
  return status === "active" || status === "trialing";
}
