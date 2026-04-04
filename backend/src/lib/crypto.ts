import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";

/**
 * Derive a 32-byte encryption key from JWT_SECRET.
 * In production, use a dedicated ENCRYPTION_KEY env var or KMS.
 */
function getKey(): Buffer {
  return createHash("sha256").update(env.JWT_SECRET).digest();
}

/**
 * Encrypt plaintext. Returns base64 string: iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypt ciphertext. Input format: iv:authTag:ciphertext (base64)
 */
export function decrypt(ciphertext: string): string {
  // If not encrypted (legacy plaintext PEM key), return as-is
  if (ciphertext.startsWith("-----BEGIN")) return ciphertext;

  const key = getKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) return ciphertext; // Not encrypted format
  const [ivB64, authTagB64, encB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encB64, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
