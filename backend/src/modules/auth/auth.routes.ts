import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticateAdmin } from "./auth.service.js";
import { authGuard } from "./auth.guard.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login
  app.post("/login", async (request, reply) => {
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

  // GET /api/auth/me
  app.get("/me", { preHandler: [authGuard] }, async (request) => {
    return { admin: request.user };
  });
}
