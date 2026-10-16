import { hashIp } from "@/lib/crypto";
import { prisma } from "@/lib/db";

// 1x1 transparent GIF
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/**
 * Open tracking pixel. Must always return the image fast, even when the
 * token is unknown or recording fails - a broken pixel breaks the email.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    const message = await prisma.emailMessage.findUnique({ where: { trackToken: token } });
    if (message) {
      const userAgent = request.headers.get("user-agent");
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

      await prisma.$transaction([
        prisma.emailMessage.update({
          where: { id: message.id },
          data: {
            openCount: { increment: 1 },
            lastOpenedAt: new Date(),
            ...(message.status === "SENT" ? { status: "DELIVERED" as const } : {}),
          },
        }),
        prisma.updateEvent.create({
          data: {
            updateId: message.updateId,
            investorId: message.investorId,
            emailMessageId: message.id,
            type: "OPENED",
            userAgent: userAgent?.slice(0, 300) ?? null,
            ipHash: ip ? hashIp(ip) : null,
          },
        }),
      ]);
    }
  } catch (err) {
    console.error("[track/open] recording failed:", err);
  }

  return new Response(new Uint8Array(PIXEL), {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
    },
  });
}
