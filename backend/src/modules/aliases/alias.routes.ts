import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authGuard } from "../auth/auth.guard.js";
import * as aliasService from "./alias.service.js";

const createAliasSchema = z.object({
  sourceLocal: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]([a-z0-9._%+-]*[a-z0-9])?$/, "Invalid alias format"),
  destination: z.string().min(3).max(1000), // comma-separated email addresses
});

export async function aliasRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // GET /api/domains/:domainId/aliases
  app.get<{ Params: { domainId: string } }>(
    "/domains/:domainId/aliases",
    async (request) => {
      return aliasService.listAliases(request.params.domainId);
    },
  );

  // POST /api/domains/:domainId/aliases
  app.post<{ Params: { domainId: string } }>(
    "/domains/:domainId/aliases",
    async (request, reply) => {
      const body = createAliasSchema.parse(request.body);
      const alias = await aliasService.createAlias(request.params.domainId, body);
      return reply.status(201).send(alias);
    },
  );

  // DELETE /api/aliases/:id
  app.delete<{ Params: { id: string } }>(
    "/aliases/:id",
    async (request) => {
      return aliasService.deleteAlias(request.params.id);
    },
  );
}
