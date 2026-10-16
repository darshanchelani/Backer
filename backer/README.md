# Backer

**Investor updates in 60 seconds - drafted from your own metrics, in your voice, sent from your own address, with a read receipt on every one.**

The loop: connect Stripe / HubSpot / Mixpanel → Backer drafts a four-section update (Wins, Metrics, Asks, What's Next) → you edit and send it from your own email → every open, click, and reply is tracked, and replies are classified by sentiment. A cadence engine nudges you when it's time to send again.

Built with Next.js 15 (App Router, TypeScript), Tailwind + shadcn/ui, Postgres + Prisma, Clerk, Resend, OpenAI, Stripe, PostHog, and Sentry.

---

## Quick start (local)

Requirements: Node 20+, Docker (for Postgres), and a free [Clerk](https://dashboard.clerk.com) app. Everything else is optional - the app runs with graceful fallbacks until you add keys.

```bash
# 1. Install dependencies
npm install

# 2. Start Postgres (container: backer-postgres, port 5434)
docker compose up -d

# 3. Create your env file and fill in the required values (see below)
cp .env.example .env

# 4. Apply migrations
npm run db:migrate

# 5. Run it
npm run dev
```

Open http://localhost:3000, sign up, and complete onboarding. Want demo data to look at? Seed the demo account (`npm run db:seed`) or use the "Load demo data" button on the Metrics page after onboarding.

### Required values in `.env`

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Already correct for the bundled `docker-compose.yml`. |
| `APP_ENCRYPTION_KEY` | 64 hex chars. Encrypts connector tokens (AES-256-GCM). `openssl rand -hex 32` |
| `IP_HASH_SALT` | Any random string (16+ chars). Salts hashed IPs in open tracking. `openssl rand -hex 16` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | From your Clerk app → API keys. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally; your real URL in production. |

### Optional values - and what happens without them

The app never breaks on a missing key; it degrades to an honest fallback:

| Missing | Fallback |
| --- | --- |
| `OPENAI_API_KEY` | Drafts are generated from a template instead of AI (same 4-section shape). |
| `RESEND_API_KEY` | Sends run in **simulation mode** - the full pipeline executes, nothing leaves the server. |
| `STRIPE_SECRET_KEY` / price IDs | Upgrade buttons are disabled; everyone runs on Free. |
| `POSTHOG_KEY` / `SENTRY_DSN` | Analytics / error reporting stay dormant. |
| `SLACK_WEBHOOK_URL` | Connector-health alerts are logged instead of posted. |
| `INBOUND_DOMAIN` | Reply-to falls back to your own address; reply ingestion is inactive. |

---

## Going live checklist

Work through this list when you're ready to send real emails and take real payments.

### 1. OpenAI (AI drafts)

- Create a key at https://platform.openai.com/api-keys → `OPENAI_API_KEY`.
- Drafts use `gpt-4o-mini` by default; override with `OPENAI_MODEL_DRAFT` (and `OPENAI_MODEL_QUALITY` for future premium paths).
- Add voice samples in **Settings → Voice samples** - the drafter uses your past writing as few-shot examples, which is the difference between "AI wrote this" and "you wrote this".

### 2. Resend (sending + tracking + replies)

- Create a key at https://resend.com/api-keys → `RESEND_API_KEY`.
- Add and verify your sending domain (Domains → Add domain, then the DNS records). Then set your sending name + address in **Settings → Sending identity**.
- Add the delivery-events webhook: Resend → Webhooks → add endpoint `https://your-app.com/api/webhooks/resend`, and copy its signing secret (starts with `whsec_`) → `RESEND_WEBHOOK_SECRET`. This is what flips messages from `SENT` to `DELIVERED` / `BOUNCED` / `COMPLAINED`.
- **Replies:** point a subdomain at Resend Inbound (e.g. `reply.yourdomain.com`, MX records in the Resend dashboard) and set `INBOUND_DOMAIN=reply.yourdomain.com`. Outgoing emails get `Reply-To: reply+{token}@reply.yourdomain.com`, replies are ingested via `POST /api/webhooks/inbound` (same `RESEND_WEBHOOK_SECRET`), and sentiment is classified automatically.

### 3. Stripe (billing)

- Create a key at https://dashboard.stripe.com/apikeys → `STRIPE_SECRET_KEY`.
- Create two recurring products/prices: **Pro $49/month** and **Scale $199/month**. Copy the price IDs → `NEXT_PUBLIC_STRIPE_PRICE_PRO` and `NEXT_PUBLIC_STRIPE_PRICE_SCALE`.
- Add the webhook: Stripe → Developers → Webhooks → endpoint `https://your-app.com/api/webhooks/stripe`, subscribed to `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`. Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
- Plans are derived **server-side from price IDs only** - nothing client-side can grant an upgrade.

### 4. Slack (connector health alerts)

- Create an incoming webhook at https://api.slack.com/messaging/webhooks → `SLACK_WEBHOOK_URL`.
- The daily health cron alerts you when a connector starts failing silently, so your metrics never quietly go stale.

### 5. PostHog + Sentry (product analytics + errors)

- PostHog: project API key → `POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_KEY` (same value; the second one reaches the browser), optional `NEXT_PUBLIC_POSTHOG_HOST` (defaults to US cloud). Server events captured: `draft_generated`, `update_sent`, `checkout_started`, `reply_received`.
- Sentry: project DSN → `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` (same value). Errors and request failures are captured via Next.js instrumentation hooks. Optional `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` enable source-map uploads at build time.

### 6. Cron jobs

`vercel.json` schedules two endpoints (guarded by `Authorization: Bearer $CRON_SECRET`; set `CRON_SECRET` to any random string):

| Endpoint | Schedule (UTC) | Job |
| --- | --- | --- |
| `/api/cron/health` | 09:00 daily | Re-checks connectors, flags failures, alerts Slack. |
| `/api/cron/reminders` | 16:00 daily | Emails founders whose cadence is due, with a one-click draft link. |

On Vercel, crons call these automatically once `CRON_SECRET` is set in the project env. Locally you can curl them (missing secret is tolerated in development only).

### 7. Deploy (Vercel)

1. Push the repo, import it in Vercel, point `DATABASE_URL` at hosted Postgres (Neon/Supabase/RDS), and add every key from `.env.example` to the project env.
2. Set `NEXT_PUBLIC_APP_URL` to the production URL, and use the production webhook secrets from Resend/Stripe for the deployed endpoints.
3. Run `npx prisma migrate deploy` against the production database.
4. Deploy. Check `/api/cron/health` once manually with your `CRON_SECRET` to confirm everything is wired.

---

## Testing the full loop without any keys

- **Metrics**: on the Metrics page, use "Load demo data" (dev only) or connect a real Stripe restricted key (`rk_`) / HubSpot private app token (`pat-`) / Mixpanel service account.
- **Drafts**: without an OpenAI key you still get a template draft; with one, add voice samples first for the real thing.
- **Sends**: without `RESEND_API_KEY`, sending is simulated - email messages, open/click tracking, and the report all behave exactly as in production (tracking links work: open the "sent" record's tracking pixel or click a button URL from the report).
- **Replies**: the report page has a "Simulate reply" action (dev only) that runs the real ingest + sentiment path.

## Plans & limits

| | Free | Pro ($49/mo) | Scale ($199/mo) |
| --- | --- | --- | --- |
| Updates/month | 1 | Unlimited | Unlimited |
| Connectors | 1 | 3 | Unlimited |
| Investors | 5 | 100 | Unlimited |
| Voice samples | 1 | 5 | 10 |
| Reply sentiment | - | Yes | Yes |

Limits are enforced server-side (`src/lib/entitlements.ts`) and surfaced in the UI with upgrade prompts.

## Project structure

```
src/
  app/
    (app)/            # Authed shell: dashboard, updates, investors, metrics, settings
    (auth)/           # Clerk sign-in / sign-up
    api/              # Route handlers: updates, connectors, billing, tracking, webhooks, crons
  components/         # UI (shadcn/ui primitives in components/ui)
  lib/
    ai/               # Prompting, metrics context, drafter, sentiment classifier
    connectors/       # Stripe / HubSpot / Mixpanel clients + sync engine
    email/            # Email renderer, send engine, svix verification, reply ingest
    jobs/             # Cron jobs (health, cadence reminders)
    billing.ts        # Stripe helpers + plan mapping
    entitlements.ts   # Plan limits + server-side gates
    analytics.ts      # PostHog server capture (env-gated)
  instrumentation.ts  # Sentry server/edge registration (env-gated)
prisma/               # Schema, migrations, demo seed
```

## Scripts

```bash
npm run dev          # Next dev server (Turbopack)
npm run build        # Production build
npm run start        # Serve the production build
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run db:migrate   # prisma migrate dev
npm run db:seed      # Seed the demo account (Northwind Labs)
npm run db:studio    # Prisma Studio
npm run db:reset     # Reset + re-migrate the database
```
