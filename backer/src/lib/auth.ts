import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { Company, User } from "@prisma/client";
import { prisma } from "./db";
import { ApiError, unauthorized } from "./api";
import { hasClerk } from "./env";

/**
 * Mirror the Clerk user into our DB on first sight. Clerk is the identity
 * provider; our User row is the FK anchor for everything else.
 */
export async function syncUser(): Promise<User | null> {
  if (!hasClerk) return null;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email = (
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress
  )?.toLowerCase();

  if (!email) {
    // Extremely rare: Clerk user without any email. Refuse rather than create broken rows.
    throw new ApiError(400, "Your account has no email address. Add one in your profile settings.", "no_email");
  }

  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() || clerkUser.username || null;

  return prisma.user.upsert({
    where: { clerkId: clerkUser.id },
    create: { clerkId: clerkUser.id, email, name, imageUrl: clerkUser.imageUrl },
    update: { email, name, imageUrl: clerkUser.imageUrl },
  });
}

/** For pages: signed-out users go to /sign-in. */
export async function requireUser(): Promise<User> {
  const user = await syncUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** For pages: user + company, or send them through onboarding. */
export async function requireCompanyPage(): Promise<{ user: User; company: Company }> {
  const user = await requireUser();
  const company = await prisma.company.findUnique({ where: { ownerId: user.id } });
  if (!company) redirect("/onboarding");
  return { user, company };
}

/** For API routes: throws 401 JSON instead of redirecting. */
export async function getAuthedContext(): Promise<{ user: User; company: Company | null }> {
  const user = await syncUser();
  if (!user) throw unauthorized();
  const company = await prisma.company.findUnique({ where: { ownerId: user.id } });
  return { user, company };
}

/** For API routes that need a fully onboarded company. */
export async function requireApiCompany(): Promise<{ user: User; company: Company }> {
  const { user, company } = await getAuthedContext();
  if (!company) {
    throw new ApiError(409, "Finish onboarding before using this feature.", "no_company");
  }
  return { user, company };
}

/**
 * For public pages (landing) - returns null instead of redirecting.
 * Never throws so marketing pages always render.
 */
export async function getViewer(): Promise<{ user: User; company: Company | null } | null> {
  try {
    if (!hasClerk) return null;
    const user = await syncUser();
    if (!user) return null;
    const company = await prisma.company.findUnique({ where: { ownerId: user.id } });
    return { user, company };
  } catch (err) {
    console.error("[auth] getViewer failed:", err);
    return null;
  }
}
