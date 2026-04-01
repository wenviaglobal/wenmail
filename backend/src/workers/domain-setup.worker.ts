import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { redis } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { db } from "../db/index.js";
import { domains } from "../db/schema.js";
import { verifyDomain } from "../modules/domains/domain.service.js";

export interface DomainSetupData {
  domainId: string;
}

/**
 * On-demand worker triggered when a new domain is added.
 * Attempts to verify DNS and activate the domain.
 */
export function createDomainSetupWorker() {
  return new Worker<DomainSetupData>(
    "domain-setup",
    async (job: Job<DomainSetupData>) => {
      const { domainId } = job.data;
      logger.info({ domainId }, "Processing domain setup");

      try {
        const result = await verifyDomain(domainId);
        logger.info(
          { domainId, status: result.domain.status },
          "Domain setup check complete",
        );
        return result;
      } catch (err) {
        logger.error({ domainId, err }, "Domain setup failed");
        throw err;
      }
    },
    {
      connection: redis,
      limiter: { max: 5, duration: 60000 }, // max 5 DNS checks per minute
    },
  );
}
