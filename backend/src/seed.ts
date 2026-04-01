/**
 * Seed script — creates initial admin user and a starter plan.
 * Run: npx tsx src/seed.ts
 */
import { db } from "./db/index.js";
import { admins, plans, clients, clientUsers } from "./db/schema.js";
import { hashPassword } from "./lib/password.js";

async function seed() {
  console.log("Seeding database...\n");

  // 1. Create default plans
  const [starterPlan] = await db.insert(plans).values({
    name: "Starter",
    maxDomains: 1,
    maxMailboxes: 50,
    maxAliases: 100,
    storagePerMailboxMb: 500,
    maxSendPerDay: 500,
    priceMonthly: "0",
  }).onConflictDoNothing().returning();

  const [businessPlan] = await db.insert(plans).values({
    name: "Business",
    maxDomains: 5,
    maxMailboxes: 200,
    maxAliases: 500,
    storagePerMailboxMb: 2000,
    maxSendPerDay: 2000,
    priceMonthly: "29.99",
  }).onConflictDoNothing().returning();

  console.log("Plans created:", starterPlan?.name, businessPlan?.name);

  // 2. Create super admin
  const adminPassword = await hashPassword("admin123456");
  const [admin] = await db.insert(admins).values({
    email: "admin@mailplatform.com",
    passwordHash: adminPassword,
    role: "superadmin",
  }).onConflictDoNothing().returning();

  if (admin) {
    console.log("Admin created:");
    console.log("  Email:    admin@mailplatform.com");
    console.log("  Password: admin123456");
  } else {
    console.log("Admin already exists (skipped)");
  }

  // 3. Create a demo client
  if (starterPlan) {
    const [demoClient] = await db.insert(clients).values({
      name: "Demo Company",
      slug: "demo-company",
      contactEmail: "contact@democompany.com",
      planId: starterPlan.id,
    }).onConflictDoNothing().returning();

    if (demoClient) {
      console.log("\nDemo client created: Demo Company");

      // Create a portal user for the demo client
      const clientPassword = await hashPassword("client123456");
      const [portalUser] = await db.insert(clientUsers).values({
        clientId: demoClient.id,
        email: "user@democompany.com",
        passwordHash: clientPassword,
        name: "Demo User",
        role: "owner",
      }).onConflictDoNothing().returning();

      if (portalUser) {
        console.log("Portal user created:");
        console.log("  Email:    user@democompany.com");
        console.log("  Password: client123456");
      }
    }
  }

  console.log("\nSeed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
