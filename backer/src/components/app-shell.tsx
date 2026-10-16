"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  Activity,
  BarChart3,
  LayoutDashboard,
  Mail,
  Menu,
  PenLine,
  Settings,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/updates", label: "Updates", icon: Mail },
  { href: "/investors", label: "Investors", icon: Users },
  { href: "/metrics", label: "Metrics", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-1 px-3">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-secondary font-medium text-secondary-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarInner({
  companyName,
  plan,
  onNavigate,
}: {
  companyName: string;
  plan: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <BarChart3 className="h-3.5 w-3.5" />
        </div>
        <span className="font-semibold tracking-tight">Backer</span>
      </div>
      <Separator />
      <div className="py-3">
        <NavList onNavigate={onNavigate} />
      </div>
      <div className="mt-auto space-y-3 border-t p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{companyName}</span>
          <Badge variant={plan === "FREE" ? "outline" : "default"} className="shrink-0 text-xs capitalize">
            {plan.toLowerCase()}
          </Badge>
        </div>
        <Link
          href="/settings"
          onClick={onNavigate}
          className="block text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Manage plan &amp; settings
        </Link>
      </div>
    </div>
  );
}

export function AppShell({
  companyName,
  plan,
  children,
}: {
  companyName: string;
  plan: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 border-r lg:block">
        <div className="sticky top-0 h-screen">
          <SidebarInner companyName={companyName} plan={plan} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open navigation">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SidebarInner companyName={companyName} plan={plan} />
              </SheetContent>
            </Sheet>
            <span className="font-semibold tracking-tight lg:hidden">Backer</span>
          </div>

          <div className="hidden lg:block" />

          <div className="flex items-center gap-3">
            <Button asChild size="sm">
              <Link href="/updates/new">
                <PenLine className="mr-1.5 h-4 w-4" /> New update
              </Link>
            </Button>
            <UserButton />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
