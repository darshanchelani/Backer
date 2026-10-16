import { format, subDays } from "date-fns";
import type { Connector, HealthResult, MetricPoint, SyncResult } from "./types";
import { errMessage } from "./types";

/**
 * Mixpanel connector via the Query API (service account secret + project id).
 *
 * Mixpanel has no "active users" number without picking an event, so the
 * connection requires the founder to name the event that represents product
 * activity for them (e.g. "App Open" or "Report Viewed").
 */

async function segmentation(
  secret: string,
  projectId: string,
  event: string,
  fromDate: string,
  toDate: string,
  type: "unique" | "general",
): Promise<Record<string, number>> {
  const url = new URL("https://mixpanel.com/api/query/segmentation");
  url.searchParams.set("project_id", projectId);
  url.searchParams.set("event", event);
  url.searchParams.set("from_date", fromDate);
  url.searchParams.set("to_date", toDate);
  url.searchParams.set("type", type);
  url.searchParams.set("unit", "day");

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Mixpanel rejected the service account secret (${res.status}). Create one in Mixpanel > Organization Settings > Service Accounts.`,
      );
    }
    const body = await res.text().catch(() => "");
    throw new Error(`Mixpanel API error ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }

  // Shape has drifted historically - accept both common layouts.
  const json = (await res.json()) as {
    values?: Record<string, Record<string, number>>;
    data?: { series?: string[]; values?: Record<string, Record<string, number>> | number[] };
  };

  const byEvent = json.values?.[event] ?? (json.data && !Array.isArray(json.data.values) ? json.data.values?.[event] : undefined);
  if (byEvent && typeof byEvent === "object") {
    const out: Record<string, number> = {};
    for (const [date, v] of Object.entries(byEvent)) out[date] = Number(v) || 0;
    return out;
  }

  const series = json.data?.series;
  const values = json.data?.values;
  if (Array.isArray(series) && Array.isArray(values) && series.length === values.length) {
    const out: Record<string, number> = {};
    series.forEach((d, i) => {
      out[d] = Number((values as number[])[i]) || 0;
    });
    return out;
  }

  throw new Error(
    `Couldn't read Mixpanel response for event "${event}". Check the event name exists in this project.`,
  );
}

export const mixpanelConnector: Connector = {
  provider: "MIXPANEL",

  async checkHealth(token, meta): Promise<HealthResult> {
    const projectId = meta.projectId;
    const keyEvent = meta.keyEvent;
    if (!projectId || !keyEvent) {
      return { ok: false, error: "Mixpanel needs a project id and a key event name." };
    }
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
      await segmentation(token, projectId, keyEvent, yesterday, today, "unique");
      return { ok: true, accountLabel: `Project ${projectId}` };
    } catch (err) {
      return { ok: false, error: errMessage(err) };
    }
  },

  async sync(token, { days, meta }): Promise<SyncResult> {
    const projectId = meta.projectId;
    const keyEvent = meta.keyEvent;
    const signupEvent = meta.signupEvent || undefined;

    if (!projectId || !keyEvent) {
      throw new Error("Mixpanel is missing its project id or key event - reconnect with both filled in.");
    }

    const toDate = format(new Date(), "yyyy-MM-dd");
    const fromDate = format(subDays(new Date(), days), "yyyy-MM-dd");

    const points: MetricPoint[] = [];

    const uniqueDaily = await segmentation(token, projectId, keyEvent, fromDate, toDate, "unique");
    const uniqueValues = Object.values(uniqueDaily);
    const activeUsers = uniqueValues.length > 0 ? uniqueValues.reduce((a, b) => a + b, 0) / uniqueValues.length : 0;
    points.push({ metric: "ACTIVE_USERS", value: Math.round(activeUsers), unit: "users" });

    const totalsDaily = await segmentation(token, projectId, keyEvent, fromDate, toDate, "general");
    const eventsTracked = Object.values(totalsDaily).reduce((a, b) => a + b, 0);
    points.push({ metric: "EVENTS_TRACKED", value: Math.round(eventsTracked), unit: "events" });

    if (signupEvent) {
      const signups = await segmentation(token, projectId, signupEvent, fromDate, toDate, "unique");
      const total = Object.values(signups).reduce((a, b) => a + b, 0);
      points.push({ metric: "NEW_SIGNUPS", value: Math.round(total), unit: "signups" });
    }

    return { points, accountLabel: `Project ${projectId}`, externalAccountId: projectId };
  },
};
