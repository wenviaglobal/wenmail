import type { FastifyInstance } from "fastify";
import { eq, and, desc, isNull, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { notifications } from "../../db/schema.js";

/**
 * Admin notification routes — /api/admin/notifications
 */
export async function adminNotificationRoutes(app: FastifyInstance) {
  const { authGuard } = await import("../auth/auth.guard.js");
  app.addHook("preHandler", authGuard);

  // GET /api/admin/notifications
  app.get("/", async () => {
    return db.select().from(notifications)
      .where(and(eq(notifications.targetType, "admin"), eq(notifications.dismissed, false)))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  });

  // GET /api/admin/notifications/unread-count
  app.get("/unread-count", async () => {
    const { sql } = await import("drizzle-orm");
    const [result] = await db.select({ count: sql<number>`COUNT(*)` }).from(notifications)
      .where(and(eq(notifications.targetType, "admin"), eq(notifications.read, false), eq(notifications.dismissed, false)));
    return { count: result?.count ?? 0 };
  });

  // PUT /api/admin/notifications/:id/read
  app.put<{ Params: { id: string } }>("/:id/read", async (request) => {
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, request.params.id));
    return { message: "Marked as read" };
  });

  // PUT /api/admin/notifications/:id/dismiss
  app.put<{ Params: { id: string } }>("/:id/dismiss", async (request) => {
    await db.update(notifications).set({ dismissed: true }).where(eq(notifications.id, request.params.id));
    return { message: "Dismissed" };
  });

  // POST /api/admin/notifications/mark-all-read
  app.post("/mark-all-read", async () => {
    await db.update(notifications).set({ read: true }).where(and(eq(notifications.targetType, "admin"), eq(notifications.read, false)));
    return { message: "All marked as read" };
  });

  // POST /api/admin/notifications/clear-all
  app.post("/clear-all", async () => {
    await db.update(notifications).set({ dismissed: true }).where(eq(notifications.targetType, "admin"));
    return { message: "All cleared" };
  });
}

/**
 * Client notification routes — /api/client-portal/notifications
 */
export async function clientNotificationRoutes(app: FastifyInstance) {
  const { clientAuthGuard } = await import("../client-portal/client-auth.guard.js");
  app.addHook("preHandler", clientAuthGuard);

  function getClientId(request: { user: unknown }): string {
    return (request.user as { clientId: string }).clientId;
  }

  // GET /api/client-portal/notifications
  app.get("/", async (request) => {
    const clientId = getClientId(request);
    return db.select().from(notifications)
      .where(and(eq(notifications.targetType, "client"), eq(notifications.targetId, clientId), eq(notifications.dismissed, false)))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  });

  // GET /api/client-portal/notifications/unread-count
  app.get("/unread-count", async (request) => {
    const clientId = getClientId(request);
    const { sql } = await import("drizzle-orm");
    const [result] = await db.select({ count: sql<number>`COUNT(*)` }).from(notifications)
      .where(and(eq(notifications.targetType, "client"), eq(notifications.targetId, clientId), eq(notifications.read, false), eq(notifications.dismissed, false)));
    return { count: result?.count ?? 0 };
  });

  // PUT /api/client-portal/notifications/:id/read
  app.put<{ Params: { id: string } }>("/:id/read", async (request) => {
    const clientId = getClientId(request);
    await db.update(notifications).set({ read: true }).where(and(eq(notifications.id, request.params.id), eq(notifications.targetId, clientId)));
    return { message: "Marked as read" };
  });

  // PUT /api/client-portal/notifications/:id/dismiss
  app.put<{ Params: { id: string } }>("/:id/dismiss", async (request) => {
    const clientId = getClientId(request);
    await db.update(notifications).set({ dismissed: true }).where(and(eq(notifications.id, request.params.id), eq(notifications.targetId, clientId)));
    return { message: "Dismissed" };
  });

  // POST /api/client-portal/notifications/mark-all-read
  app.post("/mark-all-read", async (request) => {
    const clientId = getClientId(request);
    await db.update(notifications).set({ read: true }).where(and(eq(notifications.targetType, "client"), eq(notifications.targetId, clientId), eq(notifications.read, false)));
    return { message: "All marked as read" };
  });

  // POST /api/client-portal/notifications/clear-all
  app.post("/clear-all", async (request) => {
    const clientId = getClientId(request);
    await db.update(notifications).set({ dismissed: true }).where(and(eq(notifications.targetType, "client"), eq(notifications.targetId, clientId)));
    return { message: "All cleared" };
  });
}
