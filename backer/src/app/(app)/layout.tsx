import { AppShell } from "@/components/app-shell";
import { requireCompanyPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { company } = await requireCompanyPage();
  return (
    <AppShell companyName={company.name} plan={company.plan}>
      {children}
    </AppShell>
  );
}
