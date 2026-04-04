import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authGuard } from "../auth/auth.guard.js";
import * as domainService from "./domain.service.js";
import { buildDnsInstructions } from "../settings/settings.service.js";

const createDomainSchema = z.object({
  domainName: z
    .string()
    .min(3)
    .max(255)
    .regex(/^[a-z0-9]+([-.][a-z0-9]+)*\.[a-z]{2,}$/, "Invalid domain format"),
});

export async function domainRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // GET /api/clients/:clientId/domains
  app.get<{ Params: { clientId: string } }>(
    "/clients/:clientId/domains",
    async (request) => {
      return domainService.listDomains(request.params.clientId);
    },
  );

  // POST /api/clients/:clientId/domains
  app.post<{ Params: { clientId: string } }>(
    "/clients/:clientId/domains",
    async (request, reply) => {
      const { domainName } = createDomainSchema.parse(request.body);
      const domain = await domainService.createDomain(
        request.params.clientId,
        domainName,
      );

      // Return domain with DNS setup instructions from platform settings
      const dnsInstructions = await buildDnsInstructions(domain);
      return reply.status(201).send({ domain, dnsInstructions });
    },
  );

  // POST /api/domains/:id/verify
  app.post<{ Params: { id: string } }>(
    "/domains/:id/verify",
    async (request) => {
      return domainService.verifyDomain(request.params.id);
    },
  );

  // GET /api/domains/:id/dns-status
  app.get<{ Params: { id: string } }>(
    "/domains/:id/dns-status",
    async (request) => {
      return domainService.getDnsStatus(request.params.id);
    },
  );

  // GET /api/domains/:id/dns-guide — admin gets DNS setup guide for any domain
  app.get<{ Params: { id: string } }>(
    "/domains/:id/dns-guide",
    async (request) => {
      const domain = await domainService.getDomain(request.params.id);
      return buildDnsInstructions(domain);
    },
  );

  // DELETE /api/domains/:id
  app.delete<{ Params: { id: string } }>(
    "/domains/:id",
    async (request) => {
      return domainService.deleteDomain(request.params.id);
    },
  );
}

