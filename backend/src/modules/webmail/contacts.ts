import { redis } from "../../lib/redis.js";

const CONTACTS_PREFIX = "webmail:contacts:";
const MAX_CONTACTS = 200;

/**
 * Record a contact from sent/received email.
 * Stores in Redis sorted set — most recent first.
 */
export async function recordContact(userEmail: string, contactEmail: string, contactName?: string): Promise<void> {
  if (!contactEmail || contactEmail === userEmail) return;
  try {
    const key = `${CONTACTS_PREFIX}${userEmail}`;
    const value = contactName ? `${contactName} <${contactEmail}>` : contactEmail;
    await redis.zadd(key, Date.now(), value);
    // Trim to max contacts
    await redis.zremrangebyrank(key, 0, -(MAX_CONTACTS + 1));
  } catch {}
}

/**
 * Search contacts for autocomplete.
 */
export async function searchContacts(userEmail: string, query: string): Promise<string[]> {
  try {
    const key = `${CONTACTS_PREFIX}${userEmail}`;
    const all = await redis.zrevrange(key, 0, -1);
    if (!query) return all.slice(0, 10);
    const q = query.toLowerCase();
    return all.filter(c => c.toLowerCase().includes(q)).slice(0, 10);
  } catch { return []; }
}
