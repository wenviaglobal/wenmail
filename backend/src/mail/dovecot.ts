import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../lib/logger.js";

const execFileAsync = promisify(execFile);

/**
 * Validate email format to prevent injection.
 */
function validateEmail(email: string): string {
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
    throw new Error(`Invalid email format: ${email}`);
  }
  return email;
}

/**
 * Force Dovecot to recalculate quota for a specific user.
 * Uses execFile (no shell) to prevent command injection.
 */
export async function recalcQuota(email: string): Promise<void> {
  try {
    await execFileAsync("doveadm", ["quota", "recalc", "-u", validateEmail(email)]);
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
    await execFileAsync("doveadm", ["kick", validateEmail(email)]);
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
    const { stdout } = await execFileAsync(
      "doveadm", ["mailbox", "status", "-u", validateEmail(email), "messages", "vsize", "INBOX"],
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
