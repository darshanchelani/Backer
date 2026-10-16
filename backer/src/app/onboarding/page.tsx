import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireUser();
  const company = await prisma.company.findUnique({ where: { ownerId: user.id } });
  if (company) redirect("/dashboard");

  return <OnboardingWizard defaultName={user.name ?? ""} />;
}
