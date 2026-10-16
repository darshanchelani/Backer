import { notFound } from "next/navigation";
import { UpdateEditor, type EditorVersion } from "@/components/updates/update-editor";
import { requireCompanyPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { capabilities } from "@/lib/env";
import { periodLabel } from "@/lib/format";
import { parseContent } from "@/lib/update-content";

export const dynamic = "force-dynamic";

export default async function UpdatePage({ params }: { params: Promise<{ id: string }> }) {
  const { company } = await requireCompanyPage();
  const { id } = await params;

  const update = await prisma.update.findFirst({
    where: { id, companyId: company.id },
    include: {
      versions: { orderBy: { version: "desc" } },
      _count: { select: { emails: true } },
    },
  });
  if (!update) notFound();

  const current =
    update.versions.find((v) => v.version === update.currentVersion) ?? update.versions[0] ?? null;

  const versions: EditorVersion[] = update.versions.map((v) => ({
    version: v.version,
    source: v.source,
    tone: v.tone,
    model: v.model,
    createdAt: v.createdAt.toISOString(),
  }));

  return (
    <UpdateEditor
      id={update.id}
      title={update.title}
      subject={update.subject ?? ""}
      tone={update.tone}
      status={update.status}
      currentVersion={update.currentVersion}
      periodLabel={periodLabel(update.periodStart, update.periodEnd)}
      sentAt={update.sentAt?.toISOString() ?? null}
      content={parseContent(current?.content)}
      versions={versions}
      aiEnabled={capabilities.ai}
      recipientCount={update._count.emails}
    />
  );
}
