import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ImapFlow } from "imapflow";
import { createTransport } from "nodemailer";
import { simpleParser, type ParsedMail } from "mailparser";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const composeSchema = z.object({
  to: z.string().min(1),
  subject: z.string().default("(no subject)"),
  text: z.string().default(""),
  html: z.string().optional(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.string().optional(),
  attachments: z.array(z.object({
    filename: z.string(),
    content: z.string(), // base64
    contentType: z.string().default("application/octet-stream"),
  })).optional(),
});

// Session store
const sessions = new Map<string, { email: string; password: string; expiresAt: number }>();

function getSession(request: { headers: { authorization?: string }; query?: any }) {
  const token = request.headers.authorization?.replace("Bearer ", "") || (request.query as any)?.token;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return session;
}

async function createImapClient(email: string, password: string): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: "127.0.0.1",
    port: 993,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
    tls: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

function formatAddr(addr: { name?: string; address?: string } | undefined) {
  if (!addr) return null;
  return { name: addr.name || "", address: addr.address || "" };
}

function formatAddrList(list: any) {
  if (!list) return [];
  if (Array.isArray(list)) return list.map(formatAddr).filter(Boolean);
  if (list.value) return list.value.map((a: any) => ({ name: a.name || "", address: a.address || "" }));
  return [];
}

export async function webmailRoutes(app: FastifyInstance) {
  // ==========================================
  // AUTH
  // ==========================================

  app.post("/login", async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body);
    try {
      const client = await createImapClient(email, password);
      await client.logout();
    } catch {
      return reply.status(401).send({ message: "Invalid email or password" });
    }
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { email, password, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    return { token: sessionId, email };
  });

  app.post("/logout", async (request) => {
    const token = request.headers.authorization?.replace("Bearer ", "");
    if (token) sessions.delete(token);
    return { message: "Logged out" };
  });

  // ==========================================
  // FOLDERS
  // ==========================================

  app.get("/folders", async (request, reply) => {
    const session = getSession(request as any);
    if (!session) return reply.status(401).send({ message: "Unauthorized" });

    const client = await createImapClient(session.email, session.password);
    try {
      const folders = [];
      const list = await client.list();
      for (const folder of list) {
        try {
          const status = await client.status(folder.path, { messages: true, unseen: true });
          folders.push({
            name: folder.name,
            path: folder.path,
            specialUse: folder.specialUse || null,
            messages: status.messages ?? 0,
            unseen: status.unseen ?? 0,
          });
        } catch {
          folders.push({ name: folder.name, path: folder.path, specialUse: folder.specialUse || null, messages: 0, unseen: 0 });
        }
      }
      return folders;
    } finally {
      await client.logout();
    }
  });

  // ==========================================
  // MESSAGE LIST
  // ==========================================

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
        if (total === 0) return { messages: [], total, page: pageNum, limit: limitNum };

        const end = Math.max(1, total - (pageNum - 1) * limitNum);
        const start = Math.max(1, end - limitNum + 1);

        const messages: any[] = [];
        for await (const msg of client.fetch(`${start}:${end}`, {
          uid: true,
          envelope: true,
          flags: true,
          bodyStructure: true,
          size: true,
        })) {
          const env = msg.envelope;
          messages.push({
            uid: msg.uid,
            seq: msg.seq,
            from: env?.from?.[0] ? { name: env.from[0].name || "", address: (env.from[0] as any).address || `${(env.from[0] as any).mailbox || ""}@${(env.from[0] as any).host || ""}` } : null,
            to: (env?.to || []).map((t: any) => ({ name: t.name || "", address: t.address || `${t.mailbox || ""}@${t.host || ""}` })),
            subject: env?.subject || "(no subject)",
            date: env?.date?.toISOString() || null,
            messageId: env?.messageId || null,
            flags: [...(msg.flags || [])],
            seen: msg.flags?.has("\\Seen") ?? false,
            flagged: msg.flags?.has("\\Flagged") ?? false,
            hasAttachment: hasAttachments(msg.bodyStructure),
            size: msg.size || 0,
          });
        }
        messages.reverse();
        return { messages, total, page: pageNum, limit: limitNum };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  });

  // ==========================================
  // MESSAGE DETAIL (with mailparser)
  // ==========================================

  app.get<{ Params: { uid: string } }>("/message/:uid", async (request, reply) => {
    const session = getSession(request as any);
    if (!session) return reply.status(401).send({ message: "Unauthorized" });

    const { folder = "INBOX" } = request.query as Record<string, string>;
    const uid = parseInt(request.params.uid);

    const client = await createImapClient(session.email, session.password);
    try {
      const lock = await client.getMailboxLock(folder);
      try {
        await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });

        const msg = await client.fetchOne(`${uid}`, { uid: true, source: true, flags: true, envelope: true }, { uid: true });
        if (!msg) return reply.status(404).send({ message: "Message not found" });

        const source = (msg as any).source;
        if (!source) return reply.status(404).send({ message: "Message source not available" });

        const parsed: ParsedMail = await simpleParser(source);

        return {
          uid: (msg as any).uid,
          messageId: parsed.messageId || null,
          from: formatAddr(parsed.from?.value?.[0]),
          to: formatAddrList(parsed.to),
          cc: formatAddrList(parsed.cc),
          bcc: formatAddrList(parsed.bcc),
          replyTo: formatAddrList(parsed.replyTo),
          subject: parsed.subject || "(no subject)",
          date: parsed.date?.toISOString() || null,
          flags: [...((msg as any).flags || [])],
          seen: (msg as any).flags?.has("\\Seen") ?? true,
          flagged: (msg as any).flags?.has("\\Flagged") ?? false,
          text: parsed.text || "",
          html: parsed.html || "",
          contentType: parsed.html ? "html" : "text",
          attachments: (parsed.attachments || []).map((att, i) => ({
            id: i,
            filename: att.filename || `attachment-${i}`,
            contentType: att.contentType || "application/octet-stream",
            size: att.size || 0,
          })),
          inReplyTo: parsed.inReplyTo || null,
          references: parsed.references ? (Array.isArray(parsed.references) ? parsed.references.join(" ") : parsed.references) : null,
        };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  });

  // ==========================================
  // ATTACHMENT DOWNLOAD
  // ==========================================

  app.get<{ Params: { uid: string; attachmentId: string } }>("/message/:uid/attachment/:attachmentId", async (request, reply) => {
    const session = getSession(request as any);
    if (!session) return reply.status(401).send({ message: "Unauthorized" });

    const query = request.query as Record<string, string>;
    const folder = query.folder || "INBOX";
    const uid = parseInt(request.params.uid);
    const attId = parseInt(request.params.attachmentId);

    const client = await createImapClient(session.email, session.password);
    try {
      const lock = await client.getMailboxLock(folder);
      try {
        const msg = await client.fetchOne(`${uid}`, { uid: true, source: true }, { uid: true });
        if (!msg) return reply.status(404).send({ message: "Message not found" });

        const parsed = await simpleParser((msg as any).source);
        const att = parsed.attachments?.[attId];
        if (!att) return reply.status(404).send({ message: "Attachment not found" });

        reply.header("Content-Type", att.contentType || "application/octet-stream");
        reply.header("Content-Disposition", `attachment; filename="${att.filename || "download"}"`);
        return reply.send(att.content);
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  });

  // ==========================================
  // SEND / COMPOSE
  // ==========================================

  app.post("/send", async (request, reply) => {
    const session = getSession(request as any);
    if (!session) return reply.status(401).send({ message: "Unauthorized" });

    const body = composeSchema.parse(request.body);

    const transporter = createTransport({
      host: "127.0.0.1",
      port: 587,
      secure: false,
      auth: { user: session.email, pass: session.password },
      tls: { rejectUnauthorized: false },
    });

    const mailOptions: any = {
      from: session.email,
      to: body.to,
      subject: body.subject,
      text: body.text,
      html: body.html || undefined,
      cc: body.cc || undefined,
      bcc: body.bcc || undefined,
      inReplyTo: body.inReplyTo || undefined,
      references: body.references || undefined,
    };

    if (body.attachments?.length) {
      mailOptions.attachments = body.attachments.map((att) => ({
        filename: att.filename,
        content: Buffer.from(att.content, "base64"),
        contentType: att.contentType,
      }));
    }

    await transporter.sendMail(mailOptions);


    return { message: "Email sent" };
  });

  // ==========================================
  // MOVE / DELETE / FLAG
  // ==========================================

  app.post("/move", async (request, reply) => {
    const session = getSession(request as any);
    if (!session) return reply.status(401).send({ message: "Unauthorized" });

    const { uids, fromFolder, toFolder } = z.object({
      uids: z.array(z.number()).min(1),
      fromFolder: z.string(),
      toFolder: z.string(),
    }).parse(request.body);

    const client = await createImapClient(session.email, session.password);
    try {
      const lock = await client.getMailboxLock(fromFolder);
      try {
        for (const uid of uids) {
          await client.messageMove({ uid }, toFolder, { uid: true });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
    return { message: `${uids.length} message(s) moved` };
  });

  app.post("/flag", async (request, reply) => {
    const session = getSession(request as any);
    if (!session) return reply.status(401).send({ message: "Unauthorized" });

    const { uids, folder, flag, add } = z.object({
      uids: z.array(z.number()).min(1),
      folder: z.string(),
      flag: z.string(),
      add: z.boolean(),
    }).parse(request.body);

    const client = await createImapClient(session.email, session.password);
    try {
      const lock = await client.getMailboxLock(folder);
      try {
        for (const uid of uids) {
          if (add) await client.messageFlagsAdd({ uid }, [flag], { uid: true });
          else await client.messageFlagsRemove({ uid }, [flag], { uid: true });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
    return { message: "Flags updated" };
  });

  // ==========================================
  // SEARCH
  // ==========================================

  app.get("/search", async (request, reply) => {
    const session = getSession(request as any);
    if (!session) return reply.status(401).send({ message: "Unauthorized" });

    const { folder = "INBOX", q = "" } = request.query as Record<string, string>;
    if (!q.trim()) return { messages: [], total: 0 };

    const client = await createImapClient(session.email, session.password);
    try {
      const lock = await client.getMailboxLock(folder);
      try {
        const searchResult = await client.search({
          or: [
            { subject: q },
            { from: q },
            { to: q },
            { body: q },
          ],
        });
        const results = Array.isArray(searchResult) ? searchResult : [];

        if (results.length === 0) return { messages: [], total: 0 };

        const uids = results.slice(-100); // Last 100 matches
        const messages: any[] = [];
        for await (const msg of client.fetch(uids.map(String).join(","), {
          uid: true,
          envelope: true,
          flags: true,
          size: true,
        })) {
          const env = msg.envelope;
          messages.push({
            uid: msg.uid,
            from: env?.from?.[0] ? { name: env.from[0].name || "", address: (env.from[0] as any).address || `${(env.from[0] as any).mailbox || ""}@${(env.from[0] as any).host || ""}` } : null,
            to: (env?.to || []).map((t: any) => ({ name: t.name || "", address: t.address || `${t.mailbox || ""}@${t.host || ""}` })),
            subject: env?.subject || "(no subject)",
            date: env?.date?.toISOString() || null,
            flags: [...(msg.flags || [])],
            seen: msg.flags?.has("\\Seen") ?? false,
            flagged: msg.flags?.has("\\Flagged") ?? false,
            size: msg.size || 0,
          });
        }
        messages.reverse();
        return { messages, total: results.length };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  });
}

// Helper: check if message has attachments from bodyStructure
function hasAttachments(structure: any): boolean {
  if (!structure) return false;
  if (structure.disposition === "attachment") return true;
  if (structure.childNodes) return structure.childNodes.some(hasAttachments);
  return false;
}
