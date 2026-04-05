import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { execFile, exec } from "node:child_process";
import { promisify } from "node:util";
import { eq, desc } from "drizzle-orm";
import { authGuard } from "../auth/auth.guard.js";
import { db } from "../../db/index.js";
import { blocklist } from "../../db/schema.js";
import { logAudit } from "../../lib/audit.js";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export async function bansRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // ==========================================
  // FAIL2BAN — View and manage banned IPs
  // ==========================================

  // GET /api/admin/bans/fail2ban — list all banned IPs across jails
  app.get("/fail2ban", async () => {
    const result: Array<{ jail: string; ip: string; timeOfBan?: string }> = [];
    try {
      const { stdout: statusOut } = await execAsync("fail2ban-client status 2>/dev/null");
      const jailMatch = statusOut.match(/Jail list:\s+(.+)/);
      const jails = jailMatch ? jailMatch[1].split(",").map(j => j.trim()) : [];

      for (const jail of jails) {
        try {
          const { stdout } = await execAsync(`fail2ban-client status ${jail} 2>/dev/null`);
          const bannedMatch = stdout.match(/Banned IP list:\s+(.*)/);
          if (bannedMatch && bannedMatch[1].trim()) {
            const ips = bannedMatch[1].trim().split(/\s+/);
            for (const ip of ips) {
              result.push({ jail, ip });
            }
          }
        } catch {}
      }
    } catch {}
    return { banned: result, total: result.length };
  });

  // POST /api/admin/bans/fail2ban/unban — unban an IP from a jail
  app.post("/fail2ban/unban", async (request) => {
    const { ip, jail } = z.object({ ip: z.string(), jail: z.string() }).parse(request.body);
    try {
      await execFileAsync("fail2ban-client", ["set", jail, "unbanip", ip]);
      const admin = request.user as { id: string };
      logAudit({ actorType: "admin", actorId: admin.id, action: "fail2ban.unban", details: { ip, jail } });
      return { message: `Unbanned ${ip} from ${jail}` };
    } catch (e: any) {
      return { message: `Failed to unban: ${e.message}` };
    }
  });

  // POST /api/admin/bans/fail2ban/ban — manually ban an IP
  app.post("/fail2ban/ban", async (request) => {
    const { ip, jail } = z.object({ ip: z.string(), jail: z.string().default("postfix") }).parse(request.body);
    try {
      await execFileAsync("fail2ban-client", ["set", jail, "banip", ip]);
      const admin = request.user as { id: string };
      logAudit({ actorType: "admin", actorId: admin.id, action: "fail2ban.ban", details: { ip, jail } });
      return { message: `Banned ${ip} in ${jail}` };
    } catch (e: any) {
      return { message: `Failed to ban: ${e.message}` };
    }
  });

  // ==========================================
  // CUSTOM BLOCKLIST — admin-managed bans
  // ==========================================

  // GET /api/admin/bans/blocklist — list all custom blocks
  app.get("/blocklist", async () => {
    return db.select().from(blocklist).orderBy(desc(blocklist.createdAt));
  });

  // POST /api/admin/bans/blocklist — add to blocklist
  app.post("/blocklist", async (request) => {
    const body = z.object({
      type: z.enum(["ip", "email", "domain"]),
      value: z.string().min(1).max(255),
      reason: z.string().optional(),
      permanent: z.boolean().default(true),
      expiresAt: z.string().datetime().optional(),
    }).parse(request.body);

    const admin = request.user as { id: string };

    const [entry] = await db.insert(blocklist).values({
      type: body.type,
      value: body.value.toLowerCase(),
      reason: body.reason ?? null,
      permanent: body.permanent,
      createdBy: admin.id,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    }).returning();

    // If IP, also ban in fail2ban
    if (body.type === "ip") {
      try { await execFileAsync("fail2ban-client", ["set", "postfix", "banip", body.value]); } catch {}
    }

    // If email or domain, add to Rspamd blacklist
    if (body.type === "email" || body.type === "domain") {
      try {
        const { writeFile, readFile } = await import("node:fs/promises");
        const listPath = "/etc/rspamd/local.d/multimap_blocklist.map";
        let existing = "";
        try { existing = await readFile(listPath, "utf-8"); } catch {}
        if (!existing.includes(body.value.toLowerCase())) {
          await writeFile(listPath, existing + body.value.toLowerCase() + "\n");
          await execFileAsync("rspamc", ["reload"]).catch(() => {});
        }
      } catch {}
    }

    logAudit({ actorType: "admin", actorId: admin.id, action: "blocklist.add", details: { type: body.type, value: body.value, reason: body.reason } });
    return entry;
  });

  // DELETE /api/admin/bans/blocklist/:id — remove from blocklist
  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    const [entry] = await db.select().from(blocklist).where(eq(blocklist.id, request.params.id)).limit(1);
    if (!entry) return { message: "Not found" };

    await db.delete(blocklist).where(eq(blocklist.id, request.params.id));

    // If IP, unban from fail2ban
    if (entry.type === "ip") {
      try { await execFileAsync("fail2ban-client", ["set", "postfix", "unbanip", entry.value]); } catch {}
    }

    // If email/domain, remove from Rspamd blocklist
    if (entry.type === "email" || entry.type === "domain") {
      try {
        const { readFile, writeFile } = await import("node:fs/promises");
        const listPath = "/etc/rspamd/local.d/multimap_blocklist.map";
        const content = await readFile(listPath, "utf-8");
        const updated = content.split("\n").filter(l => l.trim() !== entry.value).join("\n");
        await writeFile(listPath, updated);
        await execFileAsync("rspamc", ["reload"]).catch(() => {});
      } catch {}
    }

    const admin = request.user as { id: string };
    logAudit({ actorType: "admin", actorId: admin.id, action: "blocklist.remove", details: { type: entry.type, value: entry.value } });
    return { message: `Removed ${entry.value} from blocklist` };
  });

  // ==========================================
  // RECENT REJECTIONS — from Rspamd
  // ==========================================

  app.get("/rejections", async () => {
    try {
      const { stdout } = await execAsync("rspamc stat 2>/dev/null");
      const lines = stdout.split("\n");
      const stats: Record<string, string> = {};
      for (const line of lines) {
        const m = line.match(/^(.+?):\s+(.+)$/);
        if (m) stats[m[1].trim()] = m[2].trim();
      }
      return { stats };
    } catch {
      return { stats: {} };
    }
  });
}
