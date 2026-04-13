import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { eq, and, sql } from "drizzle-orm";
import { clientAuthGuard } from "./client-auth.guard.js";
import { db } from "../../db/index.js";
import { domains, mailboxes, clients } from "../../db/schema.js";
import { hashPasswordForDovecot } from "../../lib/password.js";
import { logger } from "../../lib/logger.js";
import { logAudit } from "../../lib/audit.js";

const execFileAsync = promisify(execFile);

function getClientId(request: { user: unknown }): string {
  return (request.user as { clientId: string }).clientId;
}

export async function importExportRoutes(app: FastifyInstance) {
  app.addHook("preHandler", clientAuthGuard);

  // ==========================================
  // CSV BULK MAILBOX CREATION
  // ==========================================

  // GET /api/client-portal/import/csv-template — download CSV template
  app.get("/import/csv-template", async (_request, reply) => {
    const csv = "local_part,display_name,password,quota_mb\njohn,John Smith,SecurePass@123,500\njane,Jane Doe,AnotherPass@456,500\nhr,HR Department,HrDept@789,1000\n";
    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", "attachment; filename=mailbox-import-template.csv");
    return reply.send(csv);
  });

  // POST /api/client-portal/import/csv — bulk create mailboxes from CSV
  app.post("/import/csv", async (request, reply) => {
    const clientId = getClientId(request);
    const { domainId, csvData } = z.object({
      domainId: z.string().uuid(),
      csvData: z.string().min(10),
    }).parse(request.body);

    // Verify domain belongs to client
    const domain = await db.query.domains.findFirst({
      where: and(eq(domains.id, domainId), eq(domains.clientId, clientId)),
    });
    if (!domain) return reply.status(404).send({ message: "Domain not found" });

    // Get client plan limits
    const client = await db.query.clients.findFirst({
      where: eq(clients.id, clientId),
      with: { plan: true },
    });
    const maxMailboxes = client?.maxMailboxOverride ?? client?.plan?.maxMailboxes ?? 50;
    const storageLimit = client?.plan?.storagePerMailboxMb ?? 500;

    // Count existing mailboxes
    const [{ count: existing }] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailboxes)
      .where(and(eq(mailboxes.clientId, clientId), eq(mailboxes.status, "active")));

    // Parse CSV
    const lines = csvData.trim().split("\n");
    const header = lines[0].toLowerCase();
    if (!header.includes("local_part") || !header.includes("password")) {
      return reply.status(400).send({ message: "CSV must have columns: local_part, password. Optional: display_name, quota_mb" });
    }

    const rows = lines.slice(1).map(line => {
      const parts = line.split(",").map(p => p.trim().replace(/^"|"$/g, ""));
      const cols = header.split(",").map(c => c.trim());
      const row: Record<string, string> = {};
      cols.forEach((col, i) => { row[col] = parts[i] || ""; });
      return row;
    }).filter(r => r.local_part && r.password);

    if (rows.length === 0) return reply.status(400).send({ message: "No valid rows found in CSV" });
    if (existing + rows.length > maxMailboxes) {
      return reply.status(400).send({ message: `Would exceed plan limit: ${existing} existing + ${rows.length} new = ${existing + rows.length}, max ${maxMailboxes}` });
    }

    const results: Array<{ localPart: string; status: string; error?: string }> = [];

    for (const row of rows) {
      try {
        const localPart = row.local_part.toLowerCase().replace(/[^a-z0-9._-]/g, "");
        if (!localPart || localPart.length > 64) { results.push({ localPart: row.local_part, status: "failed", error: "Invalid local part" }); continue; }
        if (row.password.length < 8) { results.push({ localPart, status: "failed", error: "Password too short (min 8)" }); continue; }

        // Check if already exists
        const exists = await db.query.mailboxes.findFirst({
          where: and(eq(mailboxes.domainId, domainId), eq(mailboxes.localPart, localPart)),
        });
        if (exists) { results.push({ localPart, status: "skipped", error: "Already exists" }); continue; }

        const passwordHash = hashPasswordForDovecot(row.password);
        const quota = Math.min(parseInt(row.quota_mb) || storageLimit, storageLimit);

        await db.insert(mailboxes).values({
          domainId, clientId, localPart, passwordHash,
          displayName: row.display_name || null,
          quotaMb: quota,
        });

        results.push({ localPart, status: "created" });
      } catch (err: any) {
        results.push({ localPart: row.local_part, status: "failed", error: err.message?.substring(0, 100) });
      }
    }

    const created = results.filter(r => r.status === "created").length;
    logAudit({ actorType: "client", action: "mailbox.bulk_import", targetType: "domain", targetId: domainId, details: { created, total: rows.length } });

    return { results, summary: { total: rows.length, created, skipped: results.filter(r => r.status === "skipped").length, failed: results.filter(r => r.status === "failed").length } };
  });

  // ==========================================
  // IMAP IMPORT (sync from old provider)
  // ==========================================

  // POST /api/client-portal/import/imap — start IMAP sync
  app.post("/import/imap", async (request, reply) => {
    const clientId = getClientId(request);
    const body = z.object({
      mailboxId: z.string().uuid(),
      sourceHost: z.string().min(1),
      sourcePort: z.number().int().default(993),
      sourceUser: z.string().min(1),
      sourcePassword: z.string().min(1),
      sourceSsl: z.boolean().default(true),
    }).parse(request.body);

    // Verify mailbox belongs to client
    const mailbox = await db.query.mailboxes.findFirst({
      where: and(eq(mailboxes.id, body.mailboxId), eq(mailboxes.clientId, clientId)),
      with: { domain: true },
    });
    if (!mailbox) return reply.status(404).send({ message: "Mailbox not found" });

    const destEmail = `${mailbox.localPart}@${mailbox.domain.domainName}`;

    // Get the mailbox password from DB — we need it for IMAP auth
    // Since we can't reverse the hash, client must provide their WenMail password too
    const { destPassword } = z.object({ destPassword: z.string().min(1) }).parse(request.body);

    // Run imapsync in background
    const args = [
      "--host1", body.sourceHost,
      "--port1", String(body.sourcePort),
      "--user1", body.sourceUser,
      "--password1", body.sourcePassword,
      "--host2", "127.0.0.1",
      "--port2", "993",
      "--user2", destEmail,
      "--password2", destPassword,
      "--ssl2",
      "--no-modulesversion",
      "--timeout", "120",
    ];
    if (body.sourceSsl) args.push("--ssl1");

    // Run async — don't await
    const { notifyClient } = await import("../../lib/notify.js");

    execFileAsync("imapsync", args, { timeout: 3600000 }) // 1 hour timeout
      .then(({ stdout }) => {
        const msgLines = stdout.split("\n").filter(l => l.includes("Messages"));
        logger.info({ destEmail, source: body.sourceHost }, `IMAP sync completed: ${msgLines.join(", ")}`);
        logAudit({ actorType: "client", action: "imap.sync.completed", targetType: "mailbox", targetId: body.mailboxId, details: { source: body.sourceHost } });
        notifyClient(clientId, "migration_complete", `Migration complete: ${destEmail}`, {
          message: `All emails from ${body.sourceHost} have been copied to ${destEmail}.`,
          actionUrl: "/portal/mailboxes",
          actionLabel: "View Mailbox",
          severity: "info",
        });
      })
      .catch((err) => {
        logger.error({ destEmail, source: body.sourceHost, err: err.message }, "IMAP sync failed");
        logAudit({ actorType: "client", action: "imap.sync.failed", targetType: "mailbox", targetId: body.mailboxId, details: { source: body.sourceHost, error: err.message?.substring(0, 200) } });
        notifyClient(clientId, "migration_failed", `Migration failed: ${destEmail}`, {
          message: `Failed to import from ${body.sourceHost}. Check credentials and try again.`,
          actionUrl: "/portal/migration",
          actionLabel: "Retry",
          severity: "critical",
        });
      });

    return { message: "Migration started. This may take 10-30 minutes. You'll receive a notification when complete." };
  });

  // ==========================================
  // EXPORT
  // ==========================================

  // GET /api/client-portal/export/info — export instructions
  app.get("/export/info", async (request) => {
    const clientId = getClientId(request);
    return {
      methods: [
        {
          name: "IMAP Download",
          description: "Connect any email client (Thunderbird, Outlook) via IMAP to download all emails locally.",
          instructions: [
            "Open your email client (Thunderbird recommended for bulk export)",
            "Add your WenMail account using IMAP settings",
            "Select all emails → drag to a local folder",
            "Your emails are now saved locally",
          ],
        },
        {
          name: "Maildir Archive (Admin Request)",
          description: "Request a compressed archive of your mailbox data from the platform admin.",
          instructions: [
            "Contact your platform admin",
            "They can provide a .tar.gz archive of your mailbox",
            "This includes all emails, folders, and attachments in Maildir format",
          ],
        },
      ],
      note: "All your data belongs to you. You can export and leave anytime — no vendor lock-in.",
    };
  });
}
