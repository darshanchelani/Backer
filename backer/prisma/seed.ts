// Seed script - full demo-data seeding is added alongside the demo flow.
// Runs via: npm run db:seed
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("[seed] placeholder - full demo seed lands with the dashboard build");
  console.log("[seed] connected:", (await prisma.$queryRaw`SELECT 1 as ok`).length === 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
