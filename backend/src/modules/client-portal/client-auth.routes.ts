import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../../db/index.js";
import { clientUsers, clients } from "../../db/schema.js";
import { verifyPassword, hashPassword } from "../../lib/password.js";
import { AppError } from "../../lib/errors.js";
import { clientAuthGuard } from "./client-auth.guard.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8).max(128),
});

export async function clientAuthRoutes(app: FastifyInstance) {
  // POST /api/client-portal/auth/login
  app.post("/login", async (request) => {
    const { email, password } = loginSchema.parse(request.body);

    const [user] = await db
      .select({
        id: clientUsers.id,
        email: clientUsers.email,
        name: clientUsers.name,
        role: clientUsers.role,
        passwordHash: clientUsers.passwordHash,
        clientId: clientUsers.clientId,
        status: clientUsers.status,
        clientName: clients.name,
        clientStatus: clients.status,
      })
      .from(clientUsers)
      .innerJoin(clients, eq(clientUsers.clientId, clients.id))
      .where(eq(clientUsers.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    if (user.status !== "active") {
      throw new AppError(403, "Your account has been disabled", "ACCOUNT_DISABLED");
    }

    if (user.clientStatus !== "active") {
      throw new AppError(403, "Your organization's service is currently suspended", "SERVICE_SUSPENDED");
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    // Update last login
    await db
      .update(clientUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(clientUsers.id, user.id));

    const accessToken = app.jwt.sign(
      {
        id: user.id,
        clientId: user.clientId,
        email: user.email,
        role: user.role,
        type: "client",
      },
      { expiresIn: "30m" },
    );

    const refreshToken = app.jwt.sign(
      { id: user.id, clientId: user.clientId, type: "client-refresh" },
      { expiresIn: "7d" },
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        clientId: user.clientId,
        clientName: user.clientName,
      },
    };
  });

  // POST /api/client-portal/auth/refresh
  app.post("/refresh", async (request, reply) => {
    const { refreshToken } = z
      .object({ refreshToken: z.string() })
      .parse(request.body);

    try {
      const payload = app.jwt.verify<{ id: string; clientId: string; type: string }>(refreshToken);
      if (payload.type !== "client-refresh") {
        return reply.status(401).send({ error: "Invalid token type" });
      }
      const accessToken = app.jwt.sign(
        { id: payload.id, clientId: payload.clientId, type: "client" },
        { expiresIn: "30m" },
      );
      return { accessToken };
    } catch {
      return reply.status(401).send({ error: "Invalid refresh token" });
    }
  });

  // GET /api/client-portal/auth/me
  app.get("/me", { preHandler: [clientAuthGuard] }, async (request) => {
    const { id, clientId } = request.user as { id: string; clientId: string };

    const [user] = await db
      .select({
        id: clientUsers.id,
        email: clientUsers.email,
        name: clientUsers.name,
        role: clientUsers.role,
        clientId: clientUsers.clientId,
        clientName: clients.name,
        clientSlug: clients.slug,
        planName: clients.planId,
        clientStatus: clients.status,
        billingStatus: clients.billingStatus,
      })
      .from(clientUsers)
      .innerJoin(clients, eq(clientUsers.clientId, clients.id))
      .where(eq(clientUsers.id, id))
      .limit(1);

    if (!user) throw new AppError(404, "User not found", "NOT_FOUND");
    return { user };
  });

  // PUT /api/client-portal/auth/password
  app.put("/password", { preHandler: [clientAuthGuard] }, async (request) => {
    const { id } = request.user as { id: string };
    const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);

    const [user] = await db
      .select({ passwordHash: clientUsers.passwordHash })
      .from(clientUsers)
      .where(eq(clientUsers.id, id));

    if (!user) throw new AppError(404, "User not found", "NOT_FOUND");

    const valid = await verifyPassword(user.passwordHash, currentPassword);
    if (!valid) throw new AppError(401, "Current password is incorrect", "INVALID_CREDENTIALS");

    const newHash = await hashPassword(newPassword);
    await db
      .update(clientUsers)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(clientUsers.id, id));

    return { message: "Password updated" };
  });
}
