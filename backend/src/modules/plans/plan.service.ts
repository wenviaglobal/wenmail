import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { plans } from "../../db/schema.js";
import { NotFoundError } from "../../lib/errors.js";

interface CreatePlanInput {
  name: string;
  maxDomains?: number;
  maxMailboxes?: number;
  maxAliases?: number;
  storagePerMailboxMb?: number;
  maxSendPerDay?: number;
  priceMonthly?: string;
}

export async function listPlans() {
  return db.select().from(plans).orderBy(plans.name);
}

export async function getPlan(id: string) {
  const plan = await db.query.plans.findFirst({ where: eq(plans.id, id) });
  if (!plan) throw new NotFoundError("Plan", id);
  return plan;
}

export async function createPlan(input: CreatePlanInput) {
  const [plan] = await db.insert(plans).values(input).returning();
  return plan;
}

export async function updatePlan(id: string, input: Partial<CreatePlanInput>) {
  const [plan] = await db
    .update(plans)
    .set(input)
    .where(eq(plans.id, id))
    .returning();
  if (!plan) throw new NotFoundError("Plan", id);
  return plan;
}

export async function deletePlan(id: string) {
  const [plan] = await db.delete(plans).where(eq(plans.id, id)).returning();
  if (!plan) throw new NotFoundError("Plan", id);
  return plan;
}
