import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { authGuard } from "../auth/auth.guard.js";
import { db } from "../../db/index.js";
import { clients, domains, mailboxes, aliases, mailLogs } from "../../db/schema.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // GET /api/dashboard/stats
  app.get("/stats", async () => {
    const [[clientCount], [domainCount], [mailboxCount], [aliasCount], recentLogs] =
      await Promise.all([
        db.select({ count: sql<number>`COUNT(*)` }).from(clients),
        db.select({ count: sql<number>`COUNT(*)` }).from(domains),
        db.select({ count: sql<number>`COUNT(*)` }).from(mailboxes),
        db.select({ count: sql<number>`COUNT(*)` }).from(aliases),
        db
          .select()
          .from(mailLogs)
          .orderBy(sql`created_at DESC`)
          .limit(10),
      ]);

    return {
      clients: clientCount.count,
      domains: domainCount.count,
      mailboxes: mailboxCount.count,
      aliases: aliasCount.count,
      recentActivity: recentLogs,
    };
  });
}
