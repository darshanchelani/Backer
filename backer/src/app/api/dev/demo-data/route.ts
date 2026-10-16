import { NextResponse } from "next/server";
import { handleApi, ok } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { populateDemoData } from "@/lib/demo";

/**
 * Dev-only: fills the current company with demo data so the whole loop
 * (metrics -> draft -> send -> opens -> replies) can be exercised fast.
 * Disabled in production builds.
 */
export async function POST() {
  return handleApi(async () => {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Not available in production." }, { status: 404 });
    }
    const { company } = await requireApiCompany();
    await populateDemoData(prisma, company.id);
    return ok({ done: true });
  });
}
