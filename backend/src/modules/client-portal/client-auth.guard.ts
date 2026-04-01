import type { FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "../../lib/errors.js";

/**
 * Guard for client portal routes.
 * Verifies JWT and checks that token has `type: "client"`.
 */
export async function clientAuthGuard(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    const user = request.user as { type?: string; clientId?: string };
    if (user.type !== "client") {
      throw new AppError(403, "Access denied: client portal only", "FORBIDDEN");
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(401, "Invalid or expired token", "UNAUTHORIZED");
  }
}
