import { Worker, type Job } from "bullmq";
import { lt, sql } from "drizzle-orm";
import { redis } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { db } from "../db/index.js";
import { mailLogs, dnsChecks } from "../db/schema.js";

/**
 * Cleans up old log entries. Runs daily.
 * - mail_logs: keep 90 days
 * - dns_checks: keep 30 days
 */
export function createLogCleanupWorker() {
  return new Worker(
    "log-cleanup",
    async (job: Job) => {
      logger.info("Starting log cleanup");

      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [mailResult] = await db
        .delete(mailLogs)
        .where(lt(mailLogs.createdAt, ninetyDaysAgo))
        .returning({ id: mailLogs.id });

      const [dnsResult] = await db
        .delete(dnsChecks)
        .where(lt(dnsChecks.checkedAt, thirtyDaysAgo))
        .returning({ id: dnsChecks.id });

      logger.info("Log cleanup complete");
      return { cleaned: true };
    },
    { connection: redis },
  );
}
