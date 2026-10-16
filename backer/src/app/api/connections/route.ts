import { z } from "zod";
import { badRequest, handleApi, ok, parseJson } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { assertWithinLimit } from "@/lib/entitlements";
import { connectors } from "@/lib/connectors";
import { syncConnection } from "@/lib/connectors/sync";

const createSchema = z
  .object({
    provider: z.enum(["STRIPE", "HUBSPOT", "MIXPANEL"]),
    token: z.string().trim().min(8, "That credential looks too short - copy the full token."),
    projectId: z.string().trim().optional(),
    keyEvent: z.string().trim().optional(),
    signupEvent: z.string().trim().optional(),
  })
  .refine((d) => d.provider !== "MIXPANEL" || (d.projectId && d.keyEvent), {
    message: "Mixpanel needs a project id and a key event name.",
    path: ["projectId"],
  });

export async function POST(request: Request) {
  return handleApi(async () => {
    const { company } = await requireApiCompany();
    const body = await parseJson(request, createSchema);

    const existing = await prisma.connection.findUnique({
      where: { companyId_provider: { companyId: company.id, provider: body.provider } },
    });
    if (!existing) {
      await assertWithinLimit(company, "connections");
    }

    const meta: Record<string, string> =
      body.provider === "MIXPANEL"
        ? {
            projectId: body.projectId ?? "",
            keyEvent: body.keyEvent ?? "",
            signupEvent: body.signupEvent ?? "",
          }
        : {};

    // Never store a credential we couldn't verify.
    const connector = connectors[body.provider]!;
    const health = await connector.checkHealth(body.token, meta);
    if (!health.ok) {
      throw badRequest(
        `Couldn't connect: ${health.error ?? "the provider rejected these credentials."}`,
        "connector_auth",
      );
    }

    const connection = await prisma.connection.upsert({
      where: { companyId_provider: { companyId: company.id, provider: body.provider } },
      create: {
        companyId: company.id,
        provider: body.provider,
        accessTokenEnc: encryptSecret(body.token),
        meta,
        status: "PENDING",
        accountLabel: health.accountLabel ?? null,
      },
      update: {
        accessTokenEnc: encryptSecret(body.token),
        meta,
        status: "PENDING",
        accountLabel: health.accountLabel ?? existing?.accountLabel ?? null,
        lastError: null,
        lastErrorAt: null,
        consecutiveFailures: 0,
      },
    });

    // First sync runs immediately so the founder sees real numbers right away.
    const outcome = await syncConnection(company.id, connection);

    return ok({
      connected: true,
      syncOk: outcome.ok,
      points: outcome.points,
      warning: outcome.ok ? undefined : outcome.error,
    });
  });
}
