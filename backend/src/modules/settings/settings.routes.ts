import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authGuard, requireRole } from "../auth/auth.guard.js";
import * as settingsService from "./settings.service.js";

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // GET /api/admin/settings — get all platform settings
  app.get("/", async () => {
    return settingsService.getAllSettings();
  });

  // PUT /api/admin/settings — update settings (superadmin only)
  app.put("/", { preHandler: [requireRole("superadmin")] }, async (request) => {
    const body = z.record(z.string(), z.string()).parse(request.body);
    await settingsService.updateSettings(body);

    // If relay settings changed, apply to Postfix
    if (body["relay.mode"] || body["relay.host"]) {
      try {
        const mode = await settingsService.getSetting("relay.mode");
        const { writeFile } = await import("node:fs/promises");
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execFileAsync = promisify(execFile);

        if (mode === "relay") {
          const host = await settingsService.getSetting("relay.host");
          const port = await settingsService.getSetting("relay.port");
          const user = await settingsService.getSetting("relay.username");
          const pass = await settingsService.getSetting("relay.password");

          if (host && user && pass) {
            // Write SASL password file
            await writeFile("/etc/postfix/sasl_passwd", `[${host}]:${port} ${user}:${pass}\n`, { mode: 0o600 });
            await execFileAsync("postmap", ["/etc/postfix/sasl_passwd"]);

            // Update Postfix main.cf
            await execFileAsync("postconf", ["-e", `relayhost=[${host}]:${port}`]);
            await execFileAsync("postconf", ["-e", "smtp_sasl_auth_enable=yes"]);
            await execFileAsync("postconf", ["-e", "smtp_sasl_password_maps=hash:/etc/postfix/sasl_passwd"]);
            await execFileAsync("postconf", ["-e", "smtp_sasl_security_options=noanonymous"]);
            await execFileAsync("postfix", ["reload"]);
          }
        } else {
          // Direct mode — remove relay
          await execFileAsync("postconf", ["-e", "relayhost="]);
          await execFileAsync("postconf", ["-e", "smtp_sasl_auth_enable=no"]);
          await execFileAsync("postfix", ["reload"]);
        }
      } catch {}
    }

    return { message: "Settings updated", updated: Object.keys(body) };
  });
}
