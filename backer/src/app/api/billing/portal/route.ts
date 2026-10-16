import { ApiError, handleApi, ok } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { stripeClient } from "@/lib/billing";

/** Stripe billing portal: change card, invoices, cancel. */
export async function POST() {
  return handleApi(async () => {
    const { company } = await requireApiCompany();

    const stripe = stripeClient();
    if (!stripe) {
      throw new ApiError(503, "Billing isn't configured yet.", "billing_not_configured");
    }
    if (!company.stripeCustomerId) {
      throw new ApiError(400, "No billing account yet - upgrade first.", "no_customer");
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripeCustomerId,
      return_url: appUrl("/settings"),
    });

    return ok({ url: session.url });
  });
}
