import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authGuard } from "../auth/auth.guard.js";
import * as settingsService from "./settings.service.js";

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // GET /api/admin/settings — get all platform settings
  app.get("/", async () => {
    return settingsService.getAllSettings();
  });

  // PUT /api/admin/settings — update settings
  app.put("/", async (request) => {
    const body = z.record(z.string(), z.string()).parse(request.body);
    await settingsService.updateSettings(body);
    return { message: "Settings updated", updated: Object.keys(body) };
  });
}
