import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticateAdmin } from "./auth.service.js";
import { authGuard } from "./auth.guard.js";
import { redis } from "../../lib/redis.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login
  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const admin = await authenticateAdmin(body.email, body.password);

    const accessToken = app.jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role },
      { expiresIn: "15m" },
    );

    const refreshToken = app.jwt.sign(
      { id: admin.id, type: "refresh" },
      { expiresIn: "7d" },
    );

    return { accessToken, refreshToken, admin };
  });

  // POST /api/auth/refresh
  app.post("/refresh", async (request, reply) => {
    const { refreshToken } = z
      .object({ refreshToken: z.string() })
      .parse(request.body);

    try {
      const payload = app.jwt.verify<{ id: string; type: string }>(refreshToken);
      if (payload.type !== "refresh") {
        return reply.status(401).send({ error: "Invalid token type" });
      }

      const accessToken = app.jwt.sign(
        { id: payload.id },
        { expiresIn: "15m" },
      );

      return { accessToken };
    } catch {
      return reply.status(401).send({ error: "Invalid refresh token" });
    }
  });

  // POST /api/auth/logout — revoke token
  app.post("/logout", { preHandler: [authGuard] }, async (request) => {
    const token = request.headers.authorization?.replace("Bearer ", "");
    if (token) {
      try {
        await redis.set(`revoked:${token}`, "1", "EX", 900); // 15min (matches access token TTL)
      } catch {
        // Redis unavailable — token will expire naturally
      }
    }
    return { message: "Logged out" };
  });

  // GET /api/auth/me
  app.get("/me", { preHandler: [authGuard] }, async (request) => {
    return { admin: request.user };
  });
}
