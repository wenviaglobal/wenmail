import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { redis } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { db } from "../db/index.js";
import { mailboxes, domains } from "../db/schema.js";

const execAsync = promisify(exec);

/**
 * Syncs actual mailbox disk usage into the database.
 * Runs every 6 hours. Uses `du` to calculate directory sizes.
 */
export function createQuotaSyncWorker() {
  return new Worker(
    "quota-sync",
    async (job: Job) => {
      logger.info("Starting quota sync for all mailboxes");

      const allMailboxes = await db
        .select({
          id: mailboxes.id,
          localPart: mailboxes.localPart,
          domainName: domains.domainName,
        })
        .from(mailboxes)
        .innerJoin(domains, eq(mailboxes.domainId, domains.id))
        .where(eq(mailboxes.status, "active"));

      let synced = 0;

      for (const mb of allMailboxes) {
        try {
          const mailPath = `/var/mail/vhosts/${mb.domainName}/${mb.localPart}`;
          const { stdout } = await execAsync(`du -sm "${mailPath}" 2>/dev/null || echo "0"`);
          const sizeMb = parseInt(stdout.split("\t")[0]) || 0;

          await db
            .update(mailboxes)
            .set({ storageUsedMb: sizeMb })
            .where(eq(mailboxes.id, mb.id));

          synced++;
        } catch (err) {
          logger.warn({ mailboxId: mb.id, err }, "Failed to sync quota");
        }
      }

      logger.info({ synced, total: allMailboxes.length }, "Quota sync complete");
      return { synced };
    },
    { connection: redis },
  );
}
