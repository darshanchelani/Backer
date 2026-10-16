import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * We deliberately do NOT protect routes by path matching here (Clerk v7
 * deprecates that approach: path matching can diverge from how Next routes
 * requests). Instead this middleware only attaches Clerk's request auth
 * context, and every protected resource checks auth where it is accessed:
 *
 *   - pages:  requireCompanyPage() in the (app) layout / onboarding page
 *   - APIs:   requireApiCompany() / getAuthedContext() in each route
 *   - public machine endpoints: their own signature/token/secret checks
 *
 * The app must also boot before Clerk keys exist (dev/setup mode).
 */
const hasClerk = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default hasClerk ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next internals and static files, run on everything else incl. API
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
