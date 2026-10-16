import { NextResponse } from "next/server";
import Stripe from "stripe";
import type { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import {
  planForPriceId,
  stripeClient,
  subscriptionKeepsPlan,
  subscriptionPeriodEnd,
  subscriptionPriceId,
} from "@/lib/billing";

/**
 * Stripe billing webhooks. Signature-verified, idempotent via WebhookEvent,
 * and every state change is derived from the subscription object itself -
 * never from client input.
 */
export async function POST(request: Request) {
  const payload = await request.text();
  const stripe = stripeClient();
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Billing webhook not configured." }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      request.headers.get("stripe-signature") ?? "",
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_externalId: { provider: "stripe", externalId: event.id } },
  });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const record = await prisma.webhookEvent.create({
    data: {
      provider: "stripe",
      externalId: event.id,
      type: event.type,
      payload: event as unknown as Prisma.InputJsonValue,
    },
  });

  try {
    await handleStripeEvent(stripe, event);
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

async function handleStripeEvent(stripe: Stripe, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!subscriptionId) return;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await applySubscription({
        companyId: session.metadata?.companyId ?? session.client_reference_id ?? undefined,
        customerId: typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null),
        subscription,
      });
      return;
    }
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await applySubscription({
        companyId: subscription.metadata?.companyId,
        customerId:
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
        subscription,
      });
      return;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await applySubscription({
        companyId: subscription.metadata?.companyId,
        customerId:
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
        subscription,
        deleted: true,
      });
      return;
    }
    default:
      return; // other events are recorded but don't change entitlements
  }
}

async function applySubscription(opts: {
  companyId?: string;
  customerId: string | null;
  subscription: Stripe.Subscription;
  deleted?: boolean;
}): Promise<void> {
  const company = opts.companyId
    ? await prisma.company.findUnique({ where: { id: opts.companyId } })
    : opts.customerId
      ? await prisma.company.findUnique({ where: { stripeCustomerId: opts.customerId } })
      : null;
  if (!company) return;

  const keep = !opts.deleted && subscriptionKeepsPlan(opts.subscription.status);
  const priceId = subscriptionPriceId(opts.subscription);
  const plan = keep ? (planForPriceId(priceId) ?? company.plan) : "FREE";

  await prisma.company.update({
    where: { id: company.id },
    data: {
      plan,
      stripeCustomerId: opts.customerId ?? company.stripeCustomerId,
      stripeSubscriptionId: opts.deleted ? null : opts.subscription.id,
      stripePriceId: keep ? priceId : null,
      planRenewsAt: keep ? subscriptionPeriodEnd(opts.subscription) : null,
    },
  });
}
