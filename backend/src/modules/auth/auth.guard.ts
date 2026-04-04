import type { FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "../../lib/errors.js";
import { redis } from "../../lib/redis.js";

export async function authGuard(request: FastifyRequest, _reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    throw new AppError(401, "Invalid or expired token", "UNAUTHORIZED");
  }

  // Check if token is blacklisted (revoked on logout)
  const token = request.headers.authorization?.replace("Bearer ", "");
  if (token) {
    try {
      const revoked = await redis.get(`revoked:${token}`);
      if (revoked) throw new AppError(401, "Token has been revoked", "TOKEN_REVOKED");
    } catch (e) {
      if (e instanceof AppError) throw e;
      // Redis unavailable — allow through (graceful degradation)
    }
  }
}

/**
 * Role-based access guard. Use after authGuard.
 * Usage: app.addHook("preHandler", requireRole("superadmin"))
 */
export function requireRole(...allowedRoles: string[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const user = request.user as { role?: string };
    if (!user?.role || !allowedRoles.includes(user.role)) {
      throw new AppError(403, "Insufficient permissions", "FORBIDDEN");
    }
  };
}
