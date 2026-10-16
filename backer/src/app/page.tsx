import Link from "next/link";
import { ArrowRight, BarChart3, Clock, Eye, ThermometerSun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer } from "@/lib/auth";
import { PLAN_META } from "@/lib/entitlements";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAIN_POINTS = [
  {
    icon: Clock,
    pain: "Updates take 4 hours every month.",
    proof: "Draft in 60 seconds. Edit if you want.",
  },
  {
    icon: Eye,
    pain: "You never know which investors actually read it.",
    proof: "Read receipts + reply sentiment, per investor.",
  },
  {
    icon: ThermometerSun,
    pain: "When someone goes quiet, you find out at the next fundraise.",
    proof: "Sentiment trends flag a cooling investor 60 days before your round.",
  },
];

export default async function LandingPage() {
  const viewer = await getViewer();
  const primaryHref = viewer ? (viewer.company ? "/dashboard" : "/onboarding") : "/sign-up";
  const primaryLabel = viewer ? (viewer.company ? "Open dashboard" : "Finish setup") : "Start free - first update in 5 minutes";

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BarChart3 className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Backer</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link href="#pricing" className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">
            Pricing
          </Link>
          {viewer ? (
            <Button asChild size="sm">
              <Link href={primaryHref}>{primaryLabel}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/sign-up">Start free</Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pb-16 pt-14 text-center sm:pt-24">
        <Badge variant="secondary" className="mb-6">
          For founders who&apos;d rather build than write status updates
        </Badge>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
          Stop writing investor updates by hand.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
          Backer drafts your monthly investor email from your Stripe, HubSpot, and Mixpanel data - in your
          voice, in 60 seconds. Send from your own address. Know exactly who read it.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href={primaryHref}>
              {viewer ? primaryLabel : "Start free - first update in 5 minutes"} <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link href="#how-it-works">Watch 90-sec demo</Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Free forever for up to 5 investors. No credit card required.
        </p>
      </section>

      {/* Pain points */}
      <section id="how-it-works" className="border-y bg-muted/40 py-16">
        <div className="mx-auto grid max-w-5xl gap-6 px-6 sm:grid-cols-3">
          {PAIN_POINTS.map((p) => (
            <div key={p.pain} className="rounded-xl border bg-background p-6">
              <p.icon className="h-5 w-5 text-muted-foreground" />
              <p className="mt-4 font-medium leading-snug">{p.pain}</p>
              <p className="mt-2 text-sm text-muted-foreground">{p.proof}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social proof slot - intentionally blank until we have a real testimonial.
          Fill in once you have 1 testimonial. Do not fake it. */}
      <section className="mx-auto hidden max-w-3xl px-6 py-16" aria-hidden />

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-5xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Pricing</h2>
          <p className="mt-3 text-muted-foreground">
            Start free and stay free until your cap table grows. Upgrade when it pays for itself.
          </p>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {(["FREE", "PRO", "SCALE"] as const).map((plan) => {
            const meta = PLAN_META[plan];
            const highlighted = plan === "PRO";
            return (
              <Card key={plan} className={cn("relative", highlighted && "border-primary shadow-md")}>
                {highlighted && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Most popular</Badge>
                )}
                <CardHeader>
                  <CardTitle className="text-lg">{meta.name}</CardTitle>
                  <CardDescription>{meta.tagline}</CardDescription>
                  <div className="pt-2">
                    <span className="text-3xl font-semibold">${meta.priceMonthly}</span>
                    <span className="text-muted-foreground">/mo</span>
                    {meta.priceYearly && (
                      <span className="ml-2 text-xs text-muted-foreground">or ${meta.priceYearly}/yr</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {meta.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <span className="text-foreground">-</span> {f}
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="w-full" variant={highlighted ? "default" : "outline"}>
                    <Link href={primaryHref}>{viewer ? primaryLabel : "Start free"}</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <footer className="border-t py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-sm text-muted-foreground sm:flex-row">
          <span>Backer - your backers, your way.</span>
          <span className="text-xs">
            Built for founders who send updates from their own address.
          </span>
        </div>
      </footer>
    </div>
  );
}
