import { subDays } from "date-fns";
import type { Connector, MetricPoint, SyncResult } from "./types";
import { errMessage } from "./types";

/**
 * HubSpot connector via a Private App access token (pat_...).
 * Scopes needed: crm.objects.deals.read
 */

const BASE = "https://api.hubapi.com";

async function hsFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `HubSpot rejected the token (${res.status}). Create a Private App in HubSpot > Settings > Integrations with crm.objects.deals.read scope.`,
      );
    }
    const body = await res.text().catch(() => "");
    throw new Error(`HubSpot API error ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return (await res.json()) as T;
}

interface DealObject {
  id: string;
  properties: {
    amount?: string | null;
    dealstage?: string | null;
    closedate?: string | null;
  };
}

interface DealsPage {
  results: DealObject[];
  paging?: { next?: { after?: string } };
}

async function collectDeals(token: string, maxPages = 10): Promise<DealObject[]> {
  const out: DealObject[] = [];
  let after: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const url = `/crm/v3/objects/deals?limit=100&properties=amount,dealstage,closedate${after ? `&after=${encodeURIComponent(after)}` : ""}`;
    const page = await hsFetch<DealsPage>(url, token);
    out.push(...page.results);
    after = page.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

interface StageInfo {
  isClosed: boolean;
  isWon: boolean;
}

async function fetchStageMap(token: string): Promise<Map<string, StageInfo>> {
  const map = new Map<string, StageInfo>();
  try {
    const pipelines = await hsFetch<{
      results: Array<{ stages: Array<{ id: string; metadata?: Record<string, string> }> }>;
    }>("/crm/v3/pipelines/deals", token);
    for (const pipeline of pipelines.results) {
      for (const stage of pipeline.stages) {
        const isClosed = stage.metadata?.isClosed === "true";
        const probability = Number(stage.metadata?.probability ?? "0");
        map.set(stage.id, { isClosed, isWon: isClosed && probability >= 1 });
      }
    }
  } catch {
    // Pipelines scope may be missing; fall back to id heuristics
  }
  return map;
}

function stageInfo(stageId: string | null | undefined, map: Map<string, StageInfo>): StageInfo {
  if (!stageId) return { isClosed: false, isWon: false };
  const fromMap = map.get(stageId);
  if (fromMap) return fromMap;
  const lower = stageId.toLowerCase();
  return {
    isClosed: lower.includes("closed"),
    isWon: lower.includes("closedwon") || lower.includes("won"),
  };
}

export const hubspotConnector: Connector = {
  provider: "HUBSPOT",

  async checkHealth(token) {
    try {
      await hsFetch("/crm/v3/objects/deals?limit=1&properties=amount", token);
      return { ok: true, accountLabel: "HubSpot portal" };
    } catch (err) {
      return { ok: false, error: errMessage(err) };
    }
  },

  async sync(token, { days }): Promise<SyncResult> {
    const sinceMs = subDays(new Date(), days).getTime();
    const [deals, stageMap] = await Promise.all([collectDeals(token), fetchStageMap(token)]);

    let pipelineValue = 0;
    let dealsOpen = 0;
    let dealsWon = 0;

    for (const deal of deals) {
      const info = stageInfo(deal.properties.dealstage, stageMap);
      const amount = parseFloat(deal.properties.amount ?? "0") || 0;

      if (!info.isClosed) {
        pipelineValue += amount;
        dealsOpen++;
      } else if (info.isWon) {
        const closedMs = deal.properties.closedate ? Date.parse(deal.properties.closedate) : NaN;
        if (!Number.isNaN(closedMs) && closedMs >= sinceMs) dealsWon++;
      }
    }

    const points: MetricPoint[] = [
      { metric: "PIPELINE_VALUE", value: Math.round(pipelineValue), currency: "USD", unit: "USD" },
      { metric: "DEALS_OPEN", value: dealsOpen, unit: "deals" },
      { metric: "DEALS_WON", value: dealsWon, unit: "deals" },
    ];

    return { points, accountLabel: "HubSpot portal" };
  },
};
