import { Worker } from "bullmq";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { redis } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { db } from "../db/index.js";
import { mailLogs, domains, mailboxes } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

const execAsync = promisify(exec);

/**
 * Mail log worker — parses Postfix syslog entries and writes to mail_logs table.
 * Runs every 5 minutes, processes new log entries since last run.
 */
export function createMailLogWorker() {
  return new Worker(
    "mail-log-sync",
    async () => {
      try {
        // Get last processed timestamp from Redis
        const lastRun = await redis.get("mail-log:last-run") || "0";
        const since = lastRun === "0" ? "5 minutes ago" : new Date(parseInt(lastRun)).toISOString();

        // Parse recent Postfix log entries from syslog
        const { stdout } = await execAsync(
          `grep "status=" /var/log/syslog 2>/dev/null | tail -200`,
          { timeout: 10000 },
        );

        const lines = stdout.split("\n").filter(l => l.includes("status="));
        let inserted = 0;

        for (const line of lines) {
          try {
            // Parse: to=<email>, from=<email>, status=sent/bounced/deferred, size=NNN
            const toMatch = line.match(/to=<([^>]+)>/);
            const fromMatch = line.match(/from=<([^>]+)>/);
            const statusMatch = line.match(/status=(\w+)/);
            const sizeMatch = line.match(/size=(\d+)/);
            const queueIdMatch = line.match(/([A-F0-9]{10,})/);
            const errorMatch = line.match(/\((.+)\)$/);

            if (!toMatch || !statusMatch) continue;

            const toAddr = toMatch[1];
            const fromAddr = fromMatch?.[1] || "";
            const status = statusMatch[1];
            const size = sizeMatch ? parseInt(sizeMatch[1]) : 0;
            const queueId = queueIdMatch?.[1] || "";
            const errorMsg = status !== "sent" ? errorMatch?.[1] || "" : "";

            // Determine direction
            const [toLocal, toDomain] = toAddr.split("@");
            const [fromLocal, fromDomain] = fromAddr.split("@");

            // Try to find domain and mailbox
            let domainId: string | undefined;
            let mailboxId: string | undefined;
            let direction = "inbound";

            // Check if sender is our domain (outbound)
            if (fromDomain) {
              const dom = await db.query.domains.findFirst({ where: eq(domains.domainName, fromDomain) });
              if (dom) {
                domainId = dom.id;
                direction = "outbound";
                const mb = await db.query.mailboxes.findFirst({
                  where: and(eq(mailboxes.domainId, dom.id), eq(mailboxes.localPart, fromLocal)),
                });
                if (mb) mailboxId = mb.id;
              }
            }

            // Check if recipient is our domain (inbound)
            if (!domainId && toDomain) {
              const dom = await db.query.domains.findFirst({ where: eq(domains.domainName, toDomain) });
              if (dom) {
                domainId = dom.id;
                direction = "inbound";
                const mb = await db.query.mailboxes.findFirst({
                  where: and(eq(mailboxes.domainId, dom.id), eq(mailboxes.localPart, toLocal)),
                });
                if (mb) mailboxId = mb.id;
              }
            }

            await db.insert(mailLogs).values({
              domainId: domainId ?? null,
              mailboxId: mailboxId ?? null,
              direction,
              fromAddress: fromAddr,
              toAddress: toAddr,
              status,
              sizeBytes: size,
              postfixQueueId: queueId,
              errorMessage: errorMsg || null,
            }).catch(() => {}); // Ignore duplicates

            inserted++;
          } catch {}
        }

        // Save last run timestamp
        await redis.set("mail-log:last-run", String(Date.now()));

        if (inserted > 0) logger.info({ inserted, total: lines.length }, "Mail logs synced from Postfix");
      } catch (err) {
        logger.warn({ err }, "Mail log sync failed (non-fatal)");
      }
    },
    { connection: redis, concurrency: 1 },
  );
}
