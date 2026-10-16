import type { MetricKind, Provider } from "@prisma/client";

// Single source of truth for how metrics are labeled and formatted.

export type MetricFormat = "money" | "count" | "months";

export interface MetricMeta {
  label: string;
  format: MetricFormat;
  description: string;
}

export const METRIC_META: Record<MetricKind, MetricMeta> = {
  MRR: { label: "MRR", format: "money", description: "Monthly recurring revenue" },
  REVENUE: { label: "Revenue (30d)", format: "money", description: "Collected charges in the last 30 days" },
  NEW_CUSTOMERS: { label: "New customers", format: "count", description: "New paying customers in the last 30 days" },
  CHURNED_CUSTOMERS: { label: "Churned customers", format: "count", description: "Customers lost in the last 30 days" },
  REFUNDS: { label: "Refunds", format: "money", description: "Refunded amount in the last 30 days" },
  PIPELINE_VALUE: { label: "Pipeline value", format: "money", description: "Open deals' total amount" },
  DEALS_OPEN: { label: "Deals open", format: "count", description: "Currently open deals" },
  DEALS_WON: { label: "Deals won", format: "count", description: "Deals won in the last 30 days" },
  ACTIVE_USERS: { label: "Active users", format: "count", description: "Average daily active users (key event)" },
  NEW_SIGNUPS: { label: "New signups", format: "count", description: "Signups in the last 30 days" },
  EVENTS_TRACKED: { label: "Events tracked", format: "count", description: "Product events in the last 30 days" },
  BURN: { label: "Monthly burn", format: "money", description: "Net monthly spend" },
  CASH_ON_HAND: { label: "Cash on hand", format: "money", description: "Current bank balance" },
  RUNWAY_MONTHS: { label: "Runway", format: "months", description: "Months of runway at current burn" },
};

export const MONEY_METRICS: MetricKind[] = [
  "MRR",
  "REVENUE",
  "REFUNDS",
  "PIPELINE_VALUE",
  "BURN",
  "CASH_ON_HAND",
];

export interface ProviderMeta {
  name: string;
  blurb: string;
  authLabel: string;
  authHint: string;
  docsUrl: string;
  docsLabel: string;
  extraFields?: Array<{
    key: "projectId" | "keyEvent" | "signupEvent";
    label: string;
    placeholder: string;
    optional?: boolean;
    hint?: string;
  }>;
}

export const PROVIDER_META: Record<Exclude<Provider, "MANUAL">, ProviderMeta> = {
  STRIPE: {
    name: "Stripe",
    blurb: "MRR, revenue, new customers, churn, refunds",
    authLabel: "Read-only API key",
    authHint: "Create a restricted key (rk_...) with read access to Subscriptions, Charges, Refunds, and Balance in Dashboard > Developers > API keys.",
    docsUrl: "https://dashboard.stripe.com/apikeys",
    docsLabel: "Open Stripe API keys",
  },
  HUBSPOT: {
    name: "HubSpot",
    blurb: "Pipeline value, deals open / won",
    authLabel: "Private app token",
    authHint: "Create a Private App in Settings > Integrations > Private Apps with the crm.objects.deals.read scope, then copy its access token (pat-...).",
    docsUrl: "https://app.hubspot.com/private-apps",
    docsLabel: "Open HubSpot Private Apps",
  },
  MIXPANEL: {
    name: "Mixpanel",
    blurb: "Active users, signups, event volume",
    authLabel: "Service account secret",
    authHint: "Create a service account in Organization Settings > Service Accounts (read access is enough).",
    docsUrl: "https://mixpanel.com/settings/org/serviceaccounts",
    docsLabel: "Open Mixpanel service accounts",
    extraFields: [
      { key: "projectId", label: "Project ID", placeholder: "1234567" },
      {
        key: "keyEvent",
        label: "Key event",
        placeholder: "App Open",
        hint: "The event that means 'someone used the product' for you.",
      },
      {
        key: "signupEvent",
        label: "Signup event",
        placeholder: "Signed Up",
        optional: true,
        hint: "Optional - lets us report new signups.",
      },
    ],
  },
};

export function formatMetricValue(metric: MetricKind, value: number, unit: string | null): string {
  const fmt = METRIC_META[metric]?.format ?? "count";
  if (fmt === "money" || unit === "USD" || unit === "USD/mo") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: value >= 100000 ? "compact" : "standard",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (fmt === "months") {
    return `${value.toLocaleString("en-US")} months`;
  }
  return new Intl.NumberFormat("en-US", {
    notation: value >= 100000 ? "compact" : "standard",
    maximumFractionDigits: 0,
  }).format(value);
}
