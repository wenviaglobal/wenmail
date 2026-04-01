import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { redis } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { db } from "../db/index.js";
import { domains, dnsChecks } from "../db/schema.js";
import { checkAllDns } from "../modules/domains/dns.service.js";

/**
 * Periodically checks DNS records for all active domains.
 * Runs every hour to detect DNS changes (removed records, misconfigurations).
 */
export function createDnsCheckWorker() {
  return new Worker(
    "dns-check",
    async (job: Job) => {
      logger.info("Starting scheduled DNS check for all active domains");

      const activeDomains = await db
        .select()
        .from(domains)
        .where(eq(domains.status, "active"));

      let checked = 0;
      let failed = 0;

      for (const domain of activeDomains) {
        try {
          const results = await checkAllDns(
            domain.domainName,
            domain.verificationToken,
            domain.dkimSelector ?? "mail",
          );

          // Store results
          for (const result of results) {
            await db.insert(dnsChecks).values({
              domainId: domain.id,
              checkType: result.type,
              status: result.pass ? "pass" : "fail",
              rawResult: result.raw,
            });
          }

          // Update domain flags
          const mx = results.find((r) => r.type === "mx");
          const spf = results.find((r) => r.type === "spf");
          const dkim = results.find((r) => r.type === "dkim");
          const dmarc = results.find((r) => r.type === "dmarc");

          await db
            .update(domains)
            .set({
              mxConfigured: mx?.pass ?? false,
              spfConfigured: spf?.pass ?? false,
              dkimConfigured: dkim?.pass ?? false,
              dmarcConfigured: dmarc?.pass ?? false,
              updatedAt: new Date(),
            })
            .where(eq(domains.id, domain.id));

          checked++;
        } catch (err) {
          logger.error({ domainId: domain.id, err }, "DNS check failed for domain");
          failed++;
        }
      }

      logger.info({ checked, failed, total: activeDomains.length }, "DNS check complete");
      return { checked, failed };
    },
    { connection: redis },
  );
}
