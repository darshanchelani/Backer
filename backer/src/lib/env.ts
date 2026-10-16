import { z } from "zod";

/**
 * Server environment - validated once at boot.
 * Every optional key has a defined fallback path (see README "Going live").
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required - is Docker running? (docker compose up -d)"),
  APP_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "APP_ENCRYPTION_KEY must be 64 hex chars (32 bytes). Generate: openssl rand -hex 32"),
  IP_HASH_SALT: z.string().min(16, "IP_HASH_SALT must be at least 16 chars"),
  NEXT_PUBLIC_APP_URL: z.string().min(1).default("http://localhost:3000"),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Jobs (Vercel cron / manual curl)
  CRON_SECRET: z.string().min(16).optional(),

  // AI drafting
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL_DRAFT: z.string().default("gpt-4o-mini"),
  OPENAI_MODEL_QUALITY: z.string().default("gpt-4o"),

  // Email send + inbound replies
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  INBOUND_DOMAIN: z.string().optional(),

  // Billing
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PRICE_PRO: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PRICE_SCALE: z.string().optional(),

  // Optional ops
  SLACK_WEBHOOK_URL: z.string().optional(),
  POSTHOG_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

function parseEnv() {
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nCompare your .env against .env.example.`,
    );
  }
  return parsed.data;
}

export const env = parseEnv();

/**
 * What's actually wired up right now. The UI uses these flags to show
 * honest states ("add OPENAI_API_KEY to switch from template drafts to AI
 * drafts") instead of breaking.
 */
export const capabilities = {
  clerk: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY),
  ai: Boolean(env.OPENAI_API_KEY),
  email: Boolean(env.RESEND_API_KEY),
  inbound: Boolean(env.INBOUND_DOMAIN),
  billing: Boolean(env.STRIPE_SECRET_KEY),
  slack: Boolean(env.SLACK_WEBHOOK_URL),
  posthog: Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY),
  sentry: Boolean(env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
} as const;

export type Capabilities = typeof capabilities;

export function appUrl(path = ""): string {
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}${path}`;
}

export const hasClerk = capabilities.clerk;
