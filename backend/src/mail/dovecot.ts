import { exec } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../lib/logger.js";

const execAsync = promisify(exec);

/**
 * Force Dovecot to recalculate quota for a specific user.
 */
export async function recalcQuota(email: string): Promise<void> {
  try {
    await execAsync(`doveadm quota recalc -u "${email}"`);
    logger.debug({ email }, "Quota recalculated");
  } catch (err) {
    logger.warn({ email, err }, "Failed to recalculate quota");
  }
}

/**
 * Kick (disconnect) a user session. Useful when disabling an account.
 */
export async function kickUser(email: string): Promise<void> {
  try {
    await execAsync(`doveadm kick "${email}"`);
    logger.info({ email }, "User session kicked");
  } catch (err) {
    logger.warn({ email, err }, "Failed to kick user");
  }
}

/**
 * Get mailbox usage stats for a user via doveadm.
 */
export async function getMailboxStats(email: string): Promise<{ messages: number; size: number } | null> {
  try {
    const { stdout } = await execAsync(
      `doveadm mailbox status -u "${email}" messages vsize INBOX`,
    );
    const parts = stdout.trim().split(/\s+/);
    return {
      messages: parseInt(parts[0]) || 0,
      size: parseInt(parts[1]) || 0,
    };
  } catch {
    return null;
  }
}
