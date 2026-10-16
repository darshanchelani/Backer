export interface EmailEngagement {
  status: string;
  openCount: number;
  clickCount: number;
}

export interface EngagementRates {
  openRate: number | null;
  clickRate: number | null;
  delivered: number;
}

/**
 * Open/click rates for one update. Failed and bounced sends are excluded
 * from the denominator so rates stay honest.
 */
export function engagementRates(emails: EmailEngagement[]): EngagementRates {
  const active = emails.filter((e) => e.status !== "FAILED" && e.status !== "BOUNCED");
  if (active.length === 0) return { openRate: null, clickRate: null, delivered: 0 };
  const opened = active.filter((e) => e.openCount > 0).length;
  const clicked = active.filter((e) => e.clickCount > 0).length;
  return {
    openRate: (opened / active.length) * 100,
    clickRate: (clicked / active.length) * 100,
    delivered: active.length,
  };
}
