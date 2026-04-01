import argon2 from "argon2";
import { execSync } from "node:child_process";

/**
 * Hash a password using argon2 for API-level auth (admin login).
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

/**
 * Verify a password against an argon2 hash.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

/**
 * Hash a password in SHA512-CRYPT format for Dovecot compatibility.
 * Uses `doveadm pw` to generate a proper crypt(3) hash that Dovecot can verify.
 */
export function hashPasswordForDovecot(password: string): string {
  try {
    const result = execSync(
      `doveadm pw -s SHA512-CRYPT -p ${shellEscape(password)}`,
      { encoding: "utf-8", timeout: 5000 },
    );
    return result.trim();
  } catch {
    // Fallback: use BLF-CRYPT via doveadm if SHA512-CRYPT fails
    try {
      const result = execSync(
        `doveadm pw -s BLF-CRYPT -p ${shellEscape(password)}`,
        { encoding: "utf-8", timeout: 5000 },
      );
      return result.trim();
    } catch {
      throw new Error("Failed to hash password: doveadm not available");
    }
  }
}

/** Escape a string for safe shell use */
function shellEscape(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}
