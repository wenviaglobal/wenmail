import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authGuard } from "../auth/auth.guard.js";
import * as mailboxService from "./mailbox.service.js";

const createMailboxSchema = z.object({
  localPart: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[a-z0-9]([a-z0-9._%+-]*[a-z0-9])?$/,
      "Invalid local part: lowercase alphanumeric, dots, hyphens allowed",
    ),
  password: z.string().min(8).max(128),
  displayName: z.string().max(255).optional(),
  quotaMb: z.number().int().min(50).max(50000).optional(),
});

const updateMailboxSchema = z.object({
  password: z.string().min(8).max(128).optional(),
  displayName: z.string().max(255).optional(),
  quotaMb: z.number().int().min(50).max(50000).optional(),
  status: z.enum(["active", "disabled", "suspended"]).optional(),
});

export async function mailboxRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // GET /api/domains/:domainId/mailboxes
  app.get<{ Params: { domainId: string } }>(
    "/domains/:domainId/mailboxes",
    async (request) => {
      return mailboxService.listMailboxes(request.params.domainId);
    },
  );

  // POST /api/domains/:domainId/mailboxes
  app.post<{ Params: { domainId: string } }>(
    "/domains/:domainId/mailboxes",
    async (request, reply) => {
      const body = createMailboxSchema.parse(request.body);
      const mailbox = await mailboxService.createMailbox(
        request.params.domainId,
        body,
      );
      return reply.status(201).send(mailbox);
    },
  );

  // PUT /api/mailboxes/:id
  app.put<{ Params: { id: string } }>(
    "/mailboxes/:id",
    async (request) => {
      const body = updateMailboxSchema.parse(request.body);
      return mailboxService.updateMailbox(request.params.id, body);
    },
  );

  // GET /api/mailboxes/:id
  app.get<{ Params: { id: string } }>(
    "/mailboxes/:id",
    async (request) => {
      return mailboxService.getMailbox(request.params.id);
    },
  );

  // DELETE /api/mailboxes/:id
  app.delete<{ Params: { id: string } }>(
    "/mailboxes/:id",
    async (request) => {
      return mailboxService.deleteMailbox(request.params.id);
    },
  );
}
