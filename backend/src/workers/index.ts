import { logger } from "../lib/logger.js";
import { redis } from "../lib/redis.js";

/**
 * Register all workers and set up repeatable job schedules.
 * Skips entirely if Redis version < 5.0 (BullMQ requirement).
 */
export async function startWorkers() {
  // Check Redis version before loading BullMQ
  try {
    const info = await redis.info("server");
    const versionMatch = info.match(/redis_version:(\S+)/);
    const version = versionMatch?.[1] ?? "0.0.0";
    const major = parseInt(version.split(".")[0]);

    if (major < 5) {
      logger.warn(
        `Redis version ${version} is too old for BullMQ (needs 5+). Background workers disabled. API will work fine without them.`,
      );
      return null;
    }
  } catch {
    logger.warn("Cannot check Redis version — skipping workers");
    return null;
  }

  // Only import BullMQ modules if Redis is new enough
  const { initQueues, getDnsCheckQueue, getQuotaSyncQueue, getLogCleanupQueue, getDkimRotationQueue, getMailLogQueue } = await import("./queues.js");
  const { createDnsCheckWorker } = await import("./dns-check.worker.js");
  const { createQuotaSyncWorker } = await import("./quota-sync.worker.js");
  const { createLogCleanupWorker } = await import("./log-cleanup.worker.js");
  const { createDomainSetupWorker } = await import("./domain-setup.worker.js");
  const { createDkimRotationWorker } = await import("./dkim-rotation.worker.js");
  const { createMailLogWorker } = await import("./mail-log.worker.js");

  initQueues();

  const dnsWorker = createDnsCheckWorker();
  const quotaWorker = createQuotaSyncWorker();
  const logWorker = createLogCleanupWorker();
  const domainWorker = createDomainSetupWorker();
  const dkimWorker = createDkimRotationWorker();
  const mailLogWorker = createMailLogWorker();

  const dnsQ = getDnsCheckQueue();
  const quotaQ = getQuotaSyncQueue();
  const logQ = getLogCleanupQueue();
  const dkimQ = getDkimRotationQueue();

  if (dnsQ) await dnsQ.upsertJobScheduler("dns-check-hourly", { pattern: "0 * * * *" });
  if (quotaQ) await quotaQ.upsertJobScheduler("quota-sync-6h", { pattern: "0 */6 * * *" });
  if (logQ) await logQ.upsertJobScheduler("log-cleanup-daily", { pattern: "0 3 * * *" });
  if (dkimQ) await dkimQ.upsertJobScheduler("dkim-rotation-weekly", { pattern: "0 4 * * 0" }); // Sunday 4 AM

  const mailLogQ = getMailLogQueue();
  if (mailLogQ) await mailLogQ.upsertJobScheduler("mail-log-sync-5m", { pattern: "*/5 * * * *" }); // Every 5 minutes

  logger.info("All workers started and schedules registered");
  return { dnsWorker, quotaWorker, logWorker, domainWorker };
}
