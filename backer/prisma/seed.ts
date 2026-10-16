// Seed script - `npm run db:seed`
// Creates a complete demo account (user + company + metrics + investors +
// a sent update with opens/clicks/replies + voice samples) so you can
// explore the product immediately.
import { PrismaClient, CompanyStage, Cadence, Plan } from "@prisma/client";
import { populateDemoData } from "../src/lib/demo";

const prisma = new PrismaClient();

async function main() {
  console.log("[seed] creating demo founder + company (Northwind Labs)...");

  const user = await prisma.user.upsert({
    where: { clerkId: "user_demo_seed_northwind" },
    update: {},
    create: {
      clerkId: "user_demo_seed_northwind",
      email: "ada@northwind.dev",
      name: "Ada Founder",
    },
  });

  let company = await prisma.company.findUnique({ where: { ownerId: user.id } });
  if (!company) {
    company = await prisma.company.create({
      data: {
        ownerId: user.id,
        name: "Northwind Labs",
        stage: CompanyStage.SEED,
        website: "https://northwind.dev",
        senderName: "Ada Founder",
        senderEmail: "ada@northwind.dev",
        cadence: Cadence.MONTHLY,
        cadenceAnchorDay: 1,
        plan: Plan.PRO,
      },
    });
  }

  await populateDemoData(prisma, company.id);

  const [investors, snapshots, updates, replies] = await Promise.all([
    prisma.investor.count({ where: { companyId: company.id } }),
    prisma.metricSnapshot.count({ where: { companyId: company.id } }),
    prisma.update.count({ where: { companyId: company.id } }),
    prisma.reply.count({ where: { update: { companyId: company.id } } }),
  ]);

  console.log(`[seed] done: ${investors} investors, ${snapshots} metric snapshots, ${updates} updates, ${replies} replies`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
