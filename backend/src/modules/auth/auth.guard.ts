import type { FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "../../lib/errors.js";

export async function authGuard(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    throw new AppError(401, "Invalid or expired token", "UNAUTHORIZED");
  }
}
