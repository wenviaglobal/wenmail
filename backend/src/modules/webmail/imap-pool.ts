import { ImapFlow } from "imapflow";

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

const sessions = new Map<string, SessionData>();
const pool = new Map<string, PooledConnection>();

// Cleanup stale connections every 60 seconds
setInterval(() => {
  const now = Date.now();
  // Clean expired sessions
  for (const [token, session] of sessions) {
    if (session.expiresAt < now) {
      sessions.delete(token);
      const conn = pool.get(token);
      if (conn) {
        conn.client.logout().catch(() => {});
        pool.delete(token);
      }
    }
  }
  // Clean idle connections (unused for 5 minutes)
  for (const [token, conn] of pool) {
    if (now - conn.lastUsed > 5 * 60 * 1000) {
      conn.client.logout().catch(() => {});
      pool.delete(token);
    }
  }
}, 60_000);

export function createSession(email: string, password: string): string {
  const token = crypto.randomUUID();
  sessions.set(token, { email, password, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  return token;
}

export function getSession(request: { headers: { authorization?: string }; query?: any }): SessionData | null {
  const token = request.headers.authorization?.replace("Bearer ", "") || (request.query as any)?.token;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) {
      sessions.delete(token);
      destroyConnection(token);
    }
    return null;
  }
  return session;
}

export function getSessionToken(request: { headers: { authorization?: string }; query?: any }): string | null {
  return request.headers.authorization?.replace("Bearer ", "") || (request.query as any)?.token || null;
}

export function destroySession(token: string): void {
  sessions.delete(token);
  destroyConnection(token);
}

function destroyConnection(token: string): void {
  const conn = pool.get(token);
  if (conn) {
    conn.client.logout().catch(() => {});
    pool.delete(token);
  }
}

/**
 * Get or create a persistent IMAP connection for this session.
 * Connections are reused across requests — no reconnect per click.
 * Uses plaintext IMAP on localhost (port 143) — safe, no TLS overhead.
 */
export async function getImapClient(token: string, email: string, password: string): Promise<ImapFlow> {
  const existing = pool.get(token);

  // Reuse if connected
  if (existing?.connected) {
    existing.lastUsed = Date.now();
    return existing.client;
  }

  // Clean up broken connection
  if (existing) {
    existing.client.logout().catch(() => {});
    pool.delete(token);
  }

  // Create new connection — plaintext on localhost (fast, no TLS overhead)
  const client = new ImapFlow({
    host: "127.0.0.1",
    port: 993,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  client.on("close", () => {
    const conn = pool.get(token);
    if (conn) conn.connected = false;
  });

  client.on("error", (err: Error) => {
    const conn = pool.get(token);
    if (conn) conn.connected = false;
    // Don't crash — just mark as disconnected, will reconnect on next request
  });


  await client.connect();

  pool.set(token, { client, email, password, lastUsed: Date.now(), connected: true });
  return client;
}

/**
 * Validate credentials by attempting an IMAP connection.
 * Used only during login.
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
  try {
    await client.connect();
    await client.logout();
    return true;
  } catch {
    return false;
  }
}
