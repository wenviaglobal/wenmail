import type { FastifyInstance } from "fastify";
import { authGuard } from "../auth/auth.guard.js";
import * as logService from "./log.service.js";

export async function logRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // GET /api/logs/mail
  app.get("/mail", async (request) => {
    const query = request.query as Record<string, string>;
    return logService.getMailLogs({
      domainId: query.domainId,
      status: query.status,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 50,
    });
  });

  // GET /api/logs/audit
  app.get("/audit", async (request) => {
    const query = request.query as Record<string, string>;
    return logService.getAuditLogs({
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 50,
    });
  });
}
