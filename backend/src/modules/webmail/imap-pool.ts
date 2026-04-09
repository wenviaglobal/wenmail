import { ImapFlow } from "imapflow";
import { redis } from "../../lib/redis.js";
import { logger } from "../../lib/logger.js";

const MAX_CONNECTIONS_PER_MAILBOX = 2;
const SESSION_TTL = 24 * 60 * 60;
const IDLE_TIMEOUT = 5 * 60 * 1000;

interface PooledConnection {
  client: ImapFlow;
  email: string;
  password: string;
  lastUsed: number;
  connected: boolean;
}

interface SessionData {
  email: string;
  password: string;
  expiresAt: number;
}

const pool = new Map<string, PooledConnection>();
const connectionsByEmail = new Map<string, Set<string>>();

// Cleanup stale connections every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [token, conn] of pool) {
    if (now - conn.lastUsed > IDLE_TIMEOUT || !conn.connected) {
      safeClose(conn.client);
      pool.delete(token);
      removeFromEmailTracker(conn.email, token);
    }
  }
}, 60_000);

/** Safely close an IMAP client — never throws */
function safeClose(client: ImapFlow) {
  try { client.logout().catch(() => {}); } catch {}
  try { client.close().catch(() => {}); } catch {}
}

function addToEmailTracker(email: string, token: string) {
  if (!connectionsByEmail.has(email)) connectionsByEmail.set(email, new Set());
  connectionsByEmail.get(email)!.add(token);
}

function removeFromEmailTracker(email: string, token: string) {
  const tokens = connectionsByEmail.get(email);
  if (tokens) {
    tokens.delete(token);
    if (tokens.size === 0) connectionsByEmail.delete(email);
  }
}

function getConnectionCount(email: string): number {
  return connectionsByEmail.get(email)?.size ?? 0;
}

// ==========================================
// SESSION MANAGEMENT (Redis-backed)
// ==========================================

const SESSION_PREFIX = "webmail:session:";

export async function createSession(email: string, password: string): Promise<string> {
  const token = crypto.randomUUID();
  const session: SessionData = { email, password, expiresAt: Date.now() + SESSION_TTL * 1000 };
  try {
    await redis.set(`${SESSION_PREFIX}${token}`, JSON.stringify(session), "EX", SESSION_TTL);
  } catch {
    logger.warn("Redis unavailable — session not persisted");
  }
  return token;
}

export async function getSession(request: { headers: { authorization?: string }; query?: any }): Promise<SessionData | null> {
  const token = getSessionToken(request);
  if (!token) return null;

  try {
    const data = await redis.get(`${SESSION_PREFIX}${token}`);
    if (!data) return null;
    const session: SessionData = JSON.parse(data);
    if (session.expiresAt < Date.now()) {
      await redis.del(`${SESSION_PREFIX}${token}`);
      destroyConnection(token);
      return null;
    }
    return session;
  } catch {
    const conn = pool.get(token);
    if (conn?.connected) return { email: conn.email, password: conn.password, expiresAt: Date.now() + 60000 };
    return null;
  }
}

export function getSessionToken(request: { headers: { authorization?: string }; query?: any }): string | null {
  return request.headers.authorization?.replace("Bearer ", "") || (request.query as any)?.token || null;
}

export async function destroySession(token: string): Promise<void> {
  try { await redis.del(`${SESSION_PREFIX}${token}`); } catch {}
  destroyConnection(token);
}

function destroyConnection(token: string): void {
  const conn = pool.get(token);
  if (conn) {
    safeClose(conn.client);
    removeFromEmailTracker(conn.email, token);
    pool.delete(token);
  }
}

/**
 * Invalidate ALL pooled connections for a specific email address.
 * Call this when a mailbox password is changed — forces re-auth on next request.
 */
export function invalidateByEmail(email: string): void {
  const tokens = connectionsByEmail.get(email);
  if (!tokens) return;
  for (const token of [...tokens]) {
    const conn = pool.get(token);
    if (conn) {
      safeClose(conn.client);
      pool.delete(token);
    }
    tokens.delete(token);
  }
  connectionsByEmail.delete(email);
  logger.info({ email }, "IMAP pool invalidated for email (password changed)");
}

// ==========================================
// IMAP CONNECTION POOL
// ==========================================

export async function getImapClient(token: string, email: string, password: string): Promise<ImapFlow> {
  const existing = pool.get(token);

  if (existing?.connected) {
    existing.lastUsed = Date.now();
    return existing.client;
  }

  // Clean up broken connection
  if (existing) {
    safeClose(existing.client);
    removeFromEmailTracker(existing.email, token);
    pool.delete(token);
  }

  // Check per-mailbox connection limit
  const count = getConnectionCount(email);
  if (count >= MAX_CONNECTIONS_PER_MAILBOX) {
    const tokens = connectionsByEmail.get(email)!;
    let oldestToken: string | null = null;
    let oldestTime = Infinity;
    for (const t of tokens) {
      const c = pool.get(t);
      if (c && c.lastUsed < oldestTime) { oldestToken = t; oldestTime = c.lastUsed; }
    }
    if (oldestToken) {
      const old = pool.get(oldestToken)!;
      safeClose(old.client);
      pool.delete(oldestToken);
      removeFromEmailTracker(email, oldestToken);
    }
  }

  // Create new IMAP connection
  const client = new ImapFlow({
    host: "127.0.0.1",
    port: 993,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  // Graceful error handling — mark as disconnected, never crash
  client.on("close", () => {
    const conn = pool.get(token);
    if (conn) conn.connected = false;
  });

  client.on("error", (err: Error) => {
    const conn = pool.get(token);
    if (conn) conn.connected = false;
    logger.debug({ email, err: err.message }, "IMAP connection error (will reconnect on next request)");
  });

  await client.connect();

  pool.set(token, { client, email, password, lastUsed: Date.now(), connected: true });
  addToEmailTracker(email, token);
  return client;
}

/**
 * Validate credentials by attempting an IMAP connection.
 * Times out after 5 seconds to prevent hanging.
 */
export async function validateCredentials(email: string, password: string): Promise<boolean> {
  const client = new ImapFlow({
    host: "127.0.0.1",
    port: 993,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
    tls: { rejectUnauthorized: false },
  });
  // Catch errors on the client to prevent unhandled events
  client.on("error", () => {});
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000));
    await Promise.race([client.connect(), timeout]);
    await client.logout();
    return true;
  } catch {
    safeClose(client);
    return false;
  }
}
