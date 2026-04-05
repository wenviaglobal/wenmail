import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { redis } from "./lib/redis.js";
import { AppError } from "./lib/errors.js";
import { ZodError } from "zod";

// Route imports — Admin
import { authRoutes } from "./modules/auth/auth.routes.js";
import { clientRoutes } from "./modules/clients/client.routes.js";
import { domainRoutes } from "./modules/domains/domain.routes.js";
import { mailboxRoutes } from "./modules/mailboxes/mailbox.routes.js";
import { aliasRoutes } from "./modules/aliases/alias.routes.js";
import { planRoutes } from "./modules/plans/plan.routes.js";
import { logRoutes } from "./modules/logs/log.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { billingRoutes } from "./modules/billing/billing.routes.js";
import { serverHealthRoutes } from "./modules/server-health/health.routes.js";
import { settingsRoutes } from "./modules/settings/settings.routes.js";

// Route imports — Client Portal
import { clientAuthRoutes } from "./modules/client-portal/client-auth.routes.js";
import { portalRoutes } from "./modules/client-portal/portal.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      transport:
        env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
  });

  // Plugins
  await app.register(helmet, {
    contentSecurityPolicy: false, // CSP can break frontend proxying
    hsts: { maxAge: 31536000, includeSubDomains: true },
  });

  await app.register(cors, {
    origin: env.NODE_ENV === "development" ? true : [`https://${env.PLATFORM_DOMAIN}`],
    credentials: true,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    // Redis rate-limit store disabled in dev if Redis version is too old
    ...(env.NODE_ENV === "production" ? { redis } : {}),
  });

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "Validation Error",
        code: "VALIDATION_ERROR",
        details: error.flatten().fieldErrors,
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      error: "Internal Server Error",
      code: "INTERNAL_ERROR",
    });
  });

  // Health check
  app.get("/api/health", async () => ({ status: "ok", timestamp: new Date().toISOString(), version: "v1" }));
  app.get("/api/v1/health", async () => ({ status: "ok", timestamp: new Date().toISOString(), version: "v1" }));

  // ==========================================
  // Admin routes (JWT with admin role)
  // ==========================================
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(clientRoutes, { prefix: "/api/clients" });
  await app.register(domainRoutes, { prefix: "/api" });
  await app.register(mailboxRoutes, { prefix: "/api" });
  await app.register(aliasRoutes, { prefix: "/api" });
  await app.register(planRoutes, { prefix: "/api/plans" });
  await app.register(logRoutes, { prefix: "/api/logs" });
  await app.register(dashboardRoutes, { prefix: "/api/dashboard" });
  await app.register(billingRoutes, { prefix: "/api/admin" });
  await app.register(serverHealthRoutes, { prefix: "/api/admin/server" });
  await app.register(settingsRoutes, { prefix: "/api/admin/settings" });
  const { abuseRoutes } = await import("./modules/admin/abuse.routes.js");
  await app.register(abuseRoutes, { prefix: "/api/admin/abuse" });

  // ==========================================
  // Client Portal routes (JWT with client type)
  // ==========================================
  await app.register(clientAuthRoutes, { prefix: "/api/client-portal/auth" });
  await app.register(portalRoutes, { prefix: "/api/client-portal" });

  // ==========================================
  // Webmail routes (IMAP/SMTP proxy — no JWT, uses own session)
  // ==========================================
  const { webmailRoutes } = await import("./modules/webmail/webmail.routes.js");
  await app.register(webmailRoutes, { prefix: "/api/webmail" });

  return app;
}
