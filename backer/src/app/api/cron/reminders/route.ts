import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeCompare } from "@/lib/crypto";
import { runReminders } from "@/lib/jobs/reminders";

/** Vercel cron (GET) or manual trigger (POST) - both need CRON_SECRET. */
function authorized(request: Request): boolean {
  if (!env.CRON_SECRET) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token.length > 0 && safeCompare(token, env.CRON_SECRET);
}

async function handle(request: Request) {
  if (!env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const summary = await runReminders();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[cron/reminders] failed:", err);
    return NextResponse.json({ error: "Reminder run failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
