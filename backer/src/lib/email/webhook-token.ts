import { env } from "../env";
import { safeCompare } from "../crypto";

/**
 * Brevo webhooks aren't signed, so we authenticate them with a secret token
 * in the URL (`?token=...`). Returns whether a secret is configured at all so
 * routes can distinguish "not set up yet" from "wrong token".
 */
export function checkWebhookToken(request: Request): { ok: boolean; configured: boolean } {
  const secret = env.BREVO_WEBHOOK_SECRET;
  if (!secret) return { ok: false, configured: false };
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return { ok: safeCompare(token, secret), configured: true };
}
