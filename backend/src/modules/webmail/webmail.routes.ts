import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ImapFlow } from "imapflow";
import { createTransport } from "nodemailer";
import { logger } from "../../lib/logger.js";
import { getSetting } from "../settings/settings.service.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const composeSchema = z.object({
  to: z.string().min(1),
  subject: z.string().default("(no subject)"),
  text: z.string().default(""),
  cc: z.string().optional(),
  bcc: z.string().optional(),
});

// Simple in-memory session store (replace with Redis in production)
const sessions = new Map<string, { email: string; password: string; expiresAt: number }>();

function generateSessionId(): string {
  return crypto.randomUUID();
}

function getSession(request: { headers: { authorization?: string } }) {
  const token = request.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return session;
}

async function createImapClient(email: string, password: string): Promise<ImapFlow> {
  const hostname = await getSetting("server.hostname");
  const client = new ImapFlow({
    host: hostname,
    port: 993,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
    tls: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

export async function webmailRoutes(app: FastifyInstance) {
  // POST /api/webmail/login
  app.post("/login", async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body);

    // Validate credentials by connecting to IMAP
    try {
      const client = await createImapClient(email, password);
      await client.logout();
    } catch {
      return reply.status(401).send({ message: "Invalid email or password" });
    }

    const sessionId = generateSessionId();
    sessions.set(sessionId, {
      email,
      password,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    });

    return { token: sessionId, email };
  });

  // POST /api/webmail/logout
  app.post("/logout", async (request) => {
    const token = request.headers.authorization?.replace("Bearer ", "");
    if (token) sessions.delete(token);
    return { message: "Logged out" };
  });

  // GET /api/webmail/folders
  app.get("/folders", async (request, reply) => {
    const session = getSession(request as any);
    if (!session) return reply.status(401).send({ message: "Unauthorized" });

    const client = await createImapClient(session.email, session.password);
    try {
      const folders = [];
      const list = await client.list();
      for (const folder of list) {
        const status = await client.status(folder.path, { messages: true, unseen: true });
        folders.push({
          name: folder.name,
          path: folder.path,
          specialUse: folder.specialUse || null,
          messages: status.messages,
          unseen: status.unseen,
        });
      }
      return folders;
    } finally {
      await client.logout();
    }
  });

  // GET /api/webmail/messages?folder=INBOX&page=1&limit=50
  app.get("/messages", async (request, reply) => {
    const session = getSession(request as any);
    if (!session) return reply.status(401).send({ message: "Unauthorized" });

    const { folder = "INBOX", page = "1", limit = "50" } = request.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const client = await createImapClient(session.email, session.password);
    try {
      const lock = await client.getMailboxLock(folder);
      try {
        const status = await client.status(folder, { messages: true });
        const total = status.messages ?? 0;
        const start = Math.max(1, total - pageNum * limitNum + 1);
        const end = Math.max(1, total - (pageNum - 1) * limitNum);

        if (total === 0) return { messages: [], total, page: pageNum, limit: limitNum };

        const messages = [];
        const range = `${start}:${end}`;
        for await (const msg of client.fetch(range, {
          uid: true,
          envelope: true,
          flags: true,
          bodyStructure: true,
          size: true,
        })) {
          messages.push({
            uid: msg.uid,
            seq: msg.seq,
            from: msg.envelope.from?.[0] ? {
              name: msg.envelope.from[0].name || "",
              address: `${msg.envelope.from[0].mailbox}@${msg.envelope.from[0].host}`,
            } : null,
            to: msg.envelope.to?.map((t: any) => ({
              name: t.name || "",
              address: `${t.mailbox}@${t.host}`,
            })) || [],
            subject: msg.envelope.subject || "(no subject)",
            date: msg.envelope.date?.toISOString() || null,
            flags: [...msg.flags],
            seen: msg.flags.has("\\Seen"),
            flagged: msg.flags.has("\\Flagged"),
            size: msg.size || 0,
          });
        }

        // Newest first
        messages.reverse();
        return { messages, total, page: pageNum, limit: limitNum };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  });

  // GET /api/webmail/message/:uid?folder=INBOX
  app.get<{ Params: { uid: string } }>("/message/:uid", async (request, reply) => {
    const session = getSession(request as any);
    if (!session) return reply.status(401).send({ message: "Unauthorized" });

    const { folder = "INBOX" } = request.query as Record<string, string>;
    const uid = parseInt(request.params.uid);

    const client = await createImapClient(session.email, session.password);
    try {
      const lock = await client.getMailboxLock(folder);
      try {
        // Mark as seen
        await client.messageFlagsAdd({ uid }, ["\\Seen"]);

        // Fetch full message
        const msg = await client.fetchOne(`${uid}`, {
          uid: true,
          envelope: true,
          source: true,
          flags: true,
        }, { uid: true });

        // Parse body from source
        const source = msg.source?.toString() || "";
        // Simple body extraction — find the text after headers
        const bodyStart = source.indexOf("\r\n\r\n");
        let body = bodyStart > 0 ? source.substring(bodyStart + 4) : source;

        // Check if multipart — extract text/plain part
        const contentType = source.match(/Content-Type:\s*([^\r\n;]+)/i)?.[1]?.trim().toLowerCase() || "text/plain";

        if (contentType.includes("multipart")) {
          const boundaryMatch = source.match(/boundary="?([^"\r\n;]+)"?/i);
          if (boundaryMatch) {
            const boundary = boundaryMatch[1];
            const parts = body.split(`--${boundary}`);
            const textPart = parts.find(p => p.includes("text/plain"));
            const htmlPart = parts.find(p => p.includes("text/html"));

            const extractPartBody = (part: string) => {
              const partBodyStart = part.indexOf("\r\n\r\n");
              return partBodyStart > 0 ? part.substring(partBodyStart + 4).replace(/--$/, "").trim() : "";
            };

            body = htmlPart ? extractPartBody(htmlPart) : (textPart ? extractPartBody(textPart) : body);
          }
        }

        return {
          uid: msg.uid,
          from: msg.envelope.from?.[0] ? {
            name: msg.envelope.from[0].name || "",
            address: `${msg.envelope.from[0].mailbox}@${msg.envelope.from[0].host}`,
          } : null,
          to: msg.envelope.to?.map((t: any) => ({
            name: t.name || "",
            address: `${t.mailbox}@${t.host}`,
          })) || [],
          cc: msg.envelope.cc?.map((t: any) => ({
            name: t.name || "",
            address: `${t.mailbox}@${t.host}`,
          })) || [],
          subject: msg.envelope.subject || "(no subject)",
          date: msg.envelope.date?.toISOString() || null,
          flags: [...msg.flags],
          seen: msg.flags.has("\\Seen"),
          body,
          contentType: contentType.includes("html") || body.includes("<html") ? "html" : "text",
        };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  });

  // POST /api/webmail/send
  app.post("/send", async (request, reply) => {
    const session = getSession(request as any);
    if (!session) return reply.status(401).send({ message: "Unauthorized" });

    const { to, subject, text, cc, bcc } = composeSchema.parse(request.body);
    const hostname = await getSetting("server.hostname");

    const transporter = createTransport({
      host: hostname,
      port: 587,
      secure: false,
      auth: { user: session.email, pass: session.password },
      tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from: session.email,
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject,
      text,
    });

    return { message: "Email sent" };
  });

  // POST /api/webmail/move — move message to folder (delete, archive, etc.)
  app.post("/move", async (request, reply) => {
    const session = getSession(request as any);
    if (!session) return reply.status(401).send({ message: "Unauthorized" });

    const { uid, fromFolder, toFolder } = z.object({
      uid: z.number(),
      fromFolder: z.string(),
      toFolder: z.string(),
    }).parse(request.body);

    const client = await createImapClient(session.email, session.password);
    try {
      const lock = await client.getMailboxLock(fromFolder);
      try {
        await client.messageMove({ uid }, toFolder, { uid: true });
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }

    return { message: "Message moved" };
  });

  // POST /api/webmail/flag — toggle flag on message
  app.post("/flag", async (request, reply) => {
    const session = getSession(request as any);
    if (!session) return reply.status(401).send({ message: "Unauthorized" });

    const { uid, folder, flag, add } = z.object({
      uid: z.number(),
      folder: z.string(),
      flag: z.string(),
      add: z.boolean(),
    }).parse(request.body);

    const client = await createImapClient(session.email, session.password);
    try {
      const lock = await client.getMailboxLock(folder);
      try {
        if (add) {
          await client.messageFlagsAdd({ uid }, [flag], { uid: true });
        } else {
          await client.messageFlagsRemove({ uid }, [flag], { uid: true });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }

    return { message: "Flag updated" };
  });
}
