import { appUrl } from "@/lib/env";
import { hashIp } from "@/lib/crypto";
import { prisma } from "@/lib/db";

/**
 * Click tracker: records the click, then redirects to the original URL.
 * Only http(s) targets are followed (no open redirects to javascript: etc).
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rawTarget = new URL(request.url).searchParams.get("u") ?? "";
  const target = /^https?:\/\//i.test(rawTarget) ? rawTarget : null;

  try {
    const message = await prisma.emailMessage.findUnique({ where: { trackToken: token } });
    if (message) {
      const userAgent = request.headers.get("user-agent");
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

      await prisma.$transaction([
        prisma.emailMessage.update({
          where: { id: message.id },
          data: {
            clickCount: { increment: 1 },
            lastClickedAt: new Date(),
            ...(message.status === "SENT" ? { status: "DELIVERED" as const } : {}),
          },
        }),
        prisma.updateEvent.create({
          data: {
            updateId: message.updateId,
            investorId: message.investorId,
            emailMessageId: message.id,
            type: "CLICKED",
            url: (target ?? rawTarget).slice(0, 2000),
            userAgent: userAgent?.slice(0, 300) ?? null,
            ipHash: ip ? hashIp(ip) : null,
          },
        }),
      ]);
    }
  } catch (err) {
    console.error("[track/click] recording failed:", err);
  }

  return Response.redirect(target ?? appUrl("/"), 302);
}
