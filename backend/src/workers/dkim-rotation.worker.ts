import { Worker } from "bullmq";
import { eq, lt } from "drizzle-orm";
import { generateKeyPairSync } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { redis } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { db } from "../db/index.js";
import { domains } from "../db/schema.js";
import { encrypt } from "../lib/crypto.js";
import { logAudit } from "../lib/audit.js";

const ROTATION_DAYS = 90;

/**
 * DKIM key rotation worker.
 * Runs weekly — checks all domains, rotates keys older than 90 days.
 */
export function createDkimRotationWorker() {
  return new Worker(
    "dkim-rotation",
    async () => {
      logger.info("Starting DKIM key rotation check");
      const cutoff = new Date(Date.now() - ROTATION_DAYS * 24 * 60 * 60 * 1000);

      const stale = await db
        .select({ id: domains.id, domainName: domains.domainName, dkimSelector: domains.dkimSelector, createdAt: domains.createdAt, updatedAt: domains.updatedAt })
        .from(domains)
        .where(lt(domains.updatedAt, cutoff));

      let rotated = 0;
      for (const domain of stale) {
        try {
          const { publicKey, privateKey } = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
          });

          await db.update(domains).set({
            dkimPrivateKey: encrypt(privateKey),
            dkimPublicKey: publicKey,
            updatedAt: new Date(),
          }).where(eq(domains.id, domain.id));

          // Save to disk for Rspamd
          await mkdir("/var/mail/dkim", { recursive: true });
          const keyPath = `/var/mail/dkim/${domain.domainName}.${domain.dkimSelector || "mail"}.key`;
          await writeFile(keyPath, privateKey, { mode: 0o640 });

          logAudit({ actorType: "system", action: "dkim.rotated", targetType: "domain", targetId: domain.id, details: { domainName: domain.domainName } });
          rotated++;
          logger.info({ domain: domain.domainName }, "DKIM key rotated");
        } catch (err) {
          logger.error({ domain: domain.domainName, err }, "Failed to rotate DKIM key");
        }
      }

      logger.info({ checked: stale.length, rotated }, "DKIM rotation complete");
    },
    { connection: redis, concurrency: 1 },
  );
}
