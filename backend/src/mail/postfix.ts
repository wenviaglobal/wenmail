import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";

const execFileAsync = promisify(execFile);

/**
 * Reload Postfix to pick up new virtual maps from PostgreSQL.
 * Uses execFile (no shell) to prevent command injection.
 */
export async function reloadPostfix(): Promise<void> {
  if (env.NODE_ENV === "development") {
    logger.debug("Skipping Postfix reload (development mode)");
    return;
  }

  try {
    await execFileAsync("postfix", ["reload"]);
    logger.info("Postfix reloaded successfully");
  } catch (err) {
    logger.error({ err }, "Failed to reload Postfix");
  }
}

/**
 * Reload Dovecot to pick up user/password changes.
 */
export async function reloadDovecot(): Promise<void> {
  if (env.NODE_ENV === "development") {
    logger.debug("Skipping Dovecot reload (development mode)");
    return;
  }

  try {
    await execFileAsync("doveadm", ["reload"]);
    logger.info("Dovecot reloaded successfully");
  } catch (err) {
    logger.error({ err }, "Failed to reload Dovecot");
  }
}
