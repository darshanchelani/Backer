/**
 * Server-side product analytics (PostHog).
 *
 * Env-gated: every call is a no-op until POSTHOG_KEY is set, and errors are
 * swallowed - analytics must never break a request path. The distinctId is
 * the Clerk user id, matching the client-side identify in the app shell.
 */
const key = process.env.POSTHOG_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

type PostHogClient = import("posthog-node").PostHog;

let client: PostHogClient | null = null;

async function getClient(): Promise<PostHogClient | null> {
  if (!key) return null;
  if (!client) {
    const { PostHog } = await import("posthog-node");
    client = new PostHog(key, { host, flushAt: 1 });
  }
  return client;
}

export type EventProperties = Record<string, string | number | boolean | null | undefined>;

export async function captureEvent(
  event: string,
  distinctId: string,
  properties: EventProperties = {},
): Promise<void> {
  try {
    const ph = await getClient();
    if (!ph) return;
    ph.capture({ distinctId, event, properties });
    await ph.flush();
  } catch (err) {
    console.error("[analytics] capture failed:", err);
  }
}
