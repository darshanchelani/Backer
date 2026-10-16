import { defineConfig } from "prisma/config";

// When a Prisma config file is present, the CLI no longer auto-loads .env.
// Node >= 20.12 ships process.loadEnvFile, so no dotenv dependency needed.
try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional (CI / deployed environments provide env vars directly)
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
