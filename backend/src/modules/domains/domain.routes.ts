import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authGuard } from "../auth/auth.guard.js";
import * as domainService from "./domain.service.js";
import { buildDnsInstructions } from "../settings/settings.service.js";
import { env } from "../../config/env.js";

const createDomainSchema = z.object({
  domainName: z
    .string()
    .min(3)
    .max(255)
    .regex(/^[a-z0-9]+([\-.][a-z0-9]+)*\.[a-z]{2,}$/, "Invalid domain format"),
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

      // Return domain with DNS setup instructions
      return reply.status(201).send({
        domain,
        dnsInstructions: {
          verification: {
            type: "TXT",
            host: domainName,
            value: `mailplatform-verify=${domain.verificationToken}`,
          },
          mx: {
            type: "MX",
            host: domainName,
            value: env.PLATFORM_DOMAIN,
            priority: 10,
          },
          spf: {
            type: "TXT",
            host: domainName,
            value: `v=spf1 include:${env.PLATFORM_DOMAIN} ~all`,
          },
          dkim: {
            type: "TXT",
            host: `${domain.dkimSelector}._domainkey.${domainName}`,
            value: `v=DKIM1; k=rsa; p=${extractDkimPublicKey(domain.dkimPublicKey!)}`,
          },
          dmarc: {
            type: "TXT",
            host: `_dmarc.${domainName}`,
            value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${env.PLATFORM_DOMAIN}`,
          },
        },
      });
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

/** Extract raw base64 public key from PEM format */
function extractDkimPublicKey(pem: string): string {
  return pem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");
}
