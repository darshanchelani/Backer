import type { MetricKind, Provider } from "@prisma/client";

export interface MetricPoint {
  metric: MetricKind;
  value: number;
  currency?: string;
  unit?: string;
}

export interface SyncOptions {
  days: number;
  meta: Record<string, string>;
}

export interface SyncResult {
  points: MetricPoint[];
  accountLabel?: string;
  externalAccountId?: string;
}

export interface HealthResult {
  ok: boolean;
  accountLabel?: string;
  error?: string;
}

export interface Connector {
  provider: Provider;
  checkHealth(token: string, meta: Record<string, string>): Promise<HealthResult>;
  sync(token: string, options: SyncOptions): Promise<SyncResult>;
}

export function errMessage(err: unknown): string {
  if (err instanceof Error) {
    const withMeta = err as Error & { code?: string; statusCode?: number };
    return withMeta.code ? `${withMeta.message} (${withMeta.code})` : withMeta.message;
  }
  return String(err);
}
