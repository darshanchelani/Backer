/* Temp smoke test - cadence math + reminder run (simulated) + health run. */
async function main() {
  process.loadEnvFile(".env");
  const { prisma } = await import("../src/lib/db");
  const { computeNextDue } = await import("../src/lib/cadence");
  const { runReminders } = await import("../src/lib/jobs/reminders");
  const { runConnectorHealth } = await import("../src/lib/jobs/health");

  const createdAt = new Date(2026, 0, 10);
  const sentAt = new Date(2026, 9, 4);
  console.log("weekly, no anchor:", computeNextDue({ cadence: "WEEKLY", anchorDay: null, lastSentAt: sentAt, companyCreatedAt: createdAt }).toDateString());
  console.log("biweekly, anchor Tue:", computeNextDue({ cadence: "BIWEEKLY", anchorDay: 2, lastSentAt: sentAt, companyCreatedAt: createdAt }).toDateString());
  console.log("monthly, no anchor:", computeNextDue({ cadence: "MONTHLY", anchorDay: null, lastSentAt: sentAt, companyCreatedAt: createdAt }).toDateString());
  console.log("monthly, anchor 15:", computeNextDue({ cadence: "MONTHLY", anchorDay: 15, lastSentAt: sentAt, companyCreatedAt: createdAt }).toDateString());
  console.log("never sent:", computeNextDue({ cadence: "MONTHLY", anchorDay: null, lastSentAt: null, companyCreatedAt: createdAt }).toDateString());

  // Reminder run with a future "now" so the demo company is due.
  const fakeNow = new Date(2026, 10, 10); // Nov 10, 2026
  const summary = await runReminders(fakeNow);
  console.log("\nreminder run:", JSON.stringify(summary, null, 2));

  const reminders = await prisma.cadenceReminder.findMany();
  console.log("reminder rows:", reminders.map((r) => ({ company: r.companyId, periodStart: r.periodStart.toDateString() })));

  // Clean up so the demo data stays pristine
  await prisma.cadenceReminder.deleteMany({});
  console.log("cleanup done");

  const health = await runConnectorHealth();
  console.log("\nhealth run:", JSON.stringify(health));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
