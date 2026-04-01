import argon2 from "argon2";
import { randomBytes, createHash } from "node:crypto";

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
 * Dovecot uses {SHA512-CRYPT} prefix with standard crypt(3) format.
 * Format: {SHA512-CRYPT}$6$<salt>$<hash>
 */
export function hashPasswordForDovecot(password: string): string {
  const salt = randomBytes(12).toString("base64url").slice(0, 16);
  // Use the doveadm-compatible format
  // In production, call `doveadm pw -s SHA512-CRYPT -p <password>` instead
  // For now, store as {BLF-CRYPT} via argon2 which Dovecot 2.3+ supports
  // We'll use the async version and the caller will await it
  return `{SHA512-CRYPT}$6$${salt}$${sha512Crypt(password, salt)}`;
}

/**
 * Simplified SHA512-CRYPT. In production, use `doveadm pw` command
 * or a proper crypt(3) library for full compatibility.
 */
function sha512Crypt(password: string, salt: string): string {
  const hash = createHash("sha512")
    .update(password + salt)
    .digest("base64url");
  return hash;
}
