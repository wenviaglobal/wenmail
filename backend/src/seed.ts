/**
 * Seed script — creates initial admin user and plans.
 * Run: npx tsx src/seed.ts
 */
import { db } from "./db/index.js";
import { admins, plans, clients, clientUsers } from "./db/schema.js";
import { hashPassword } from "./lib/password.js";

async function seed() {
  console.log("Seeding database...\n");

  // 1. Create plans
  const planData = [
    { name: "Starter", maxDomains: 1, maxMailboxes: 25, maxAliases: 50, storagePerMailboxMb: 500, maxSendPerDay: 300, priceMonthly: "0", isInternal: false },
    { name: "Standard", maxDomains: 3, maxMailboxes: 100, maxAliases: 200, storagePerMailboxMb: 1024, maxSendPerDay: 1000, priceMonthly: "14.99", isInternal: false },
    { name: "Premium", maxDomains: 10, maxMailboxes: 500, maxAliases: 1000, storagePerMailboxMb: 5120, maxSendPerDay: 5000, priceMonthly: "49.99", isInternal: false },
    { name: "Demo", maxDomains: 999, maxMailboxes: 9999, maxAliases: 9999, storagePerMailboxMb: 51200, maxSendPerDay: 99999, priceMonthly: "0", isInternal: true },
  ];

  for (const p of planData) {
    const [plan] = await db.insert(plans).values(p).onConflictDoNothing().returning();
    if (plan) console.log(`  Plan created: ${plan.name}`);
  }

  // 2. Create super admin
  const adminPassword = await hashPassword("admin123456");
  const [admin] = await db.insert(admins).values({
    email: "admin@wenvia.global",
    passwordHash: adminPassword,
    role: "superadmin",
  }).onConflictDoNothing().returning();

  if (admin) {
    console.log("\nAdmin created:");
    console.log("  Email:    admin@wenvia.global");
    console.log("  Password: admin123456");
  } else {
    console.log("\nAdmin already exists (skipped)");
  }

  console.log("\nSeed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
