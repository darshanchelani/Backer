import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Small status → color/label mappings shared across the app.

export function UpdateStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
    SENDING: { label: "Sending", className: "bg-amber-100 text-amber-800" },
    SENT: { label: "Sent", className: "bg-emerald-100 text-emerald-800" },
    FAILED: { label: "Failed", className: "bg-red-100 text-red-800" },
  };
  const cfg = map[status] ?? { label: status, className: "" };
  return (
    <Badge variant="secondary" className={cn("border-transparent text-xs", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

export function SentimentBadge({ sentiment }: { sentiment: string }) {
  const map: Record<string, { label: string; className: string }> = {
    POSITIVE: { label: "Positive", className: "bg-emerald-100 text-emerald-800" },
    NEUTRAL: { label: "Neutral", className: "bg-sky-100 text-sky-800" },
    CONCERNED: { label: "Concerned", className: "bg-amber-100 text-amber-800" },
    UNKNOWN: { label: "Unclassified", className: "bg-muted text-muted-foreground" },
  };
  const cfg = map[sentiment] ?? { label: sentiment, className: "" };
  return (
    <Badge variant="secondary" className={cn("border-transparent text-xs", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

export function ColdBadge({ children = "Cooling off" }: { children?: React.ReactNode }) {
  return (
    <Badge variant="secondary" className="border-transparent bg-slate-200 text-xs text-slate-700">
      {children}
    </Badge>
  );
}

export function PlanBadge({ plan }: { plan: string }) {
  const className =
    plan === "SCALE"
      ? "bg-violet-100 text-violet-800"
      : plan === "PRO"
        ? "bg-emerald-100 text-emerald-800"
        : "bg-muted text-muted-foreground";
  return (
    <Badge variant="secondary" className={cn("border-transparent text-xs capitalize", className)}>
      {plan.toLowerCase()}
    </Badge>
  );
}

export function ProviderBadge({ provider, status }: { provider: string; status: string }) {
  const statusClass: Record<string, string> = {
    ACTIVE: "bg-emerald-100 text-emerald-800",
    PENDING: "bg-sky-100 text-sky-800",
    ERROR: "bg-red-100 text-red-800",
    REVOKED: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="secondary" className={cn("border-transparent text-xs", statusClass[status] ?? "")}>
      {provider.charAt(0) + provider.slice(1).toLowerCase()}
    </Badge>
  );
}
