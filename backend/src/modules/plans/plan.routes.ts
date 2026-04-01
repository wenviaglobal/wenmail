import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authGuard } from "../auth/auth.guard.js";
import * as planService from "./plan.service.js";

const planSchema = z.object({
  name: z.string().min(1).max(100),
  maxDomains: z.number().int().min(1).default(1),
  maxMailboxes: z.number().int().min(1).default(50),
  maxAliases: z.number().int().min(0).default(200),
  storagePerMailboxMb: z.number().int().min(50).default(500),
  maxSendPerDay: z.number().int().min(10).default(500),
  priceMonthly: z.string().optional(),
});

export async function planRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/", async () => planService.listPlans());

  app.get<{ Params: { id: string } }>("/:id", async (request) => {
    return planService.getPlan(request.params.id);
  });

  app.post("/", async (request, reply) => {
    const body = planSchema.parse(request.body);
    const plan = await planService.createPlan(body);
    return reply.status(201).send(plan);
  });

  app.put<{ Params: { id: string } }>("/:id", async (request) => {
    const body = planSchema.partial().parse(request.body);
    return planService.updatePlan(request.params.id, body);
  });

  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    return planService.deletePlan(request.params.id);
  });
}
