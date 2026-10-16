import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {};

/**
 * Sentry is env-gated: with no DSN configured this is a plain Next config,
 * so builds never depend on Sentry being set up. Source maps are only
 * generated/uploaded when SENTRY_AUTH_TOKEN is present.
 */
const sentryEnabled = Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN);

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      silent: true,
      widenClientFileUpload: true,
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
    })
  : nextConfig;
