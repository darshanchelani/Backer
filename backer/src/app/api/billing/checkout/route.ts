import { z } from "zod";
import { ApiError, handleApi, ok, parseJson } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { PAID_PLANS, priceIdForPlan, stripeClient } from "@/lib/billing";

const schema = z.object({ plan: z.enum(PAID_PLANS) });

/** Start a Stripe Checkout session for a paid plan. */
export async function POST(request: Request) {
  return handleApi(async () => {
    const { user, company } = await requireApiCompany();
    const body = await parseJson(request, schema);

    const stripe = stripeClient();
    if (!stripe) {
      throw new ApiError(
        503,
        "Billing isn't configured yet - add STRIPE_SECRET_KEY to .env to enable upgrades.",
        "billing_not_configured",
      );
    }

    const priceId = priceIdForPlan(body.plan);
    if (!priceId) {
      throw new ApiError(
        503,
        `Add NEXT_PUBLIC_STRIPE_PRICE_${body.plan} to .env (the price id from your Stripe dashboard).`,
        "billing_not_configured",
      );
    }

    let customerId = company.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: company.name,
        metadata: { companyId: company.id },
      });
      customerId = customer.id;
      await prisma.company.update({ where: { id: company.id }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: company.id,
      subscription_data: { metadata: { companyId: company.id } },
      success_url: appUrl("/settings?billing=success"),
      cancel_url: appUrl("/settings?billing=cancelled"),
    });

    if (!session.url) {
      throw new ApiError(502, "Stripe didn't return a checkout URL - try again.", "stripe_error");
    }

    return ok({ url: session.url });
  });
}
