import { env } from "./env";

/**
 * Operator-facing alerts (Slack webhook). Used by connector health checks
 * so a silently-breaking connector never goes unnoticed.
 */
export async function sendSlackAlert(text: string): Promise<void> {
  if (!env.SLACK_WEBHOOK_URL) return;
  try {
    await fetch(env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error("[alerts] slack alert failed:", err);
  }
}
