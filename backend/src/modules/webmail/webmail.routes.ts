import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createTransport } from "nodemailer";
import { simpleParser, type ParsedMail } from "mailparser";
import {
  createSession, getSession, getSessionToken, destroySession,
  getImapClient, validateCredentials,
} from "./imap-pool.js";

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
    content: z.string(),
    contentType: z.string().default("application/octet-stream"),
  })).optional(),
});

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

function hasAttachments(structure: any): boolean {
  if (!structure) return false;
  if (structure.disposition === "attachment") return true;
  if (structure.childNodes) return structure.childNodes.some(hasAttachments);
  return false;
}

// Helper to get auth'd IMAP client for a request
async function authed(request: any, reply: any) {
  const session = await getSession(request);
  if (!session) { reply.status(401).send({ message: "Unauthorized" }); return null; }
  const token = getSessionToken(request)!;
  try {
    const client = await getImapClient(token, session.email, session.password);
    return { client, session, token };
  } catch {
    await destroySession(token);
    reply.status(401).send({ message: "Session expired, please login again" });
    return null;
  }
}

// Track failed login attempts per email — cooldown after 5 failures
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

function checkCooldown(email: string): string | null {
  const entry = failedAttempts.get(email);
  if (!entry) return null;
  if (entry.lockedUntil > Date.now()) {
    const mins = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    return `Too many failed attempts. Try again in ${mins} minute(s).`;
  }
  if (entry.lockedUntil < Date.now()) failedAttempts.delete(email);
  return null;
}

function recordFailure(email: string) {
  const entry = failedAttempts.get(email) || { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= MAX_ATTEMPTS) entry.lockedUntil = Date.now() + COOLDOWN_MS;
  failedAttempts.set(email, entry);
}

function clearFailures(email: string) { failedAttempts.delete(email); }

// Cleanup old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of failedAttempts) {
    if (entry.lockedUntil < now) failedAttempts.delete(email);
  }
}, 10 * 60 * 1000);

export async function webmailRoutes(app: FastifyInstance) {

  // ==========================================
  // AUTH
  // ==========================================

  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body);
    const [localPart, emailDomain] = email.split("@");

    if (!localPart || !emailDomain) {
      return reply.status(401).send({ message: "Invalid email or password" });
    }

    // Cooldown check — block after 5 failed attempts
    const cooldownMsg = checkCooldown(email);
    if (cooldownMsg) return reply.status(429).send({ message: cooldownMsg });

    // DB pre-check — fail fast without touching IMAP
    const { db } = await import("../../db/index.js");
    const { domains, mailboxes } = await import("../../db/schema.js");
    const { eq, and } = await import("drizzle-orm");

    // Check domain exists and is verified
    const domain = await db.query.domains.findFirst({ where: eq(domains.domainName, emailDomain) });
    if (!domain) {
      return reply.status(401).send({ message: "Invalid email or password" });
    }
    if (!domain.verified) {
      return reply.status(403).send({ message: "Domain not verified. Please complete DNS setup before using email." });
    }
    if (!domain.dkimConfigured || !domain.spfConfigured) {
      return reply.status(403).send({ message: "Domain DNS incomplete. DKIM and SPF must be configured before using email." });
    }

    // Check mailbox exists and is active — avoids IMAP connection for non-existent users
    const mailbox = await db.query.mailboxes.findFirst({
      where: and(eq(mailboxes.domainId, domain.id), eq(mailboxes.localPart, localPart.toLowerCase())),
    });
    if (!mailbox || mailbox.status !== "active") {
      return reply.status(401).send({ message: "Invalid email or password" });
    }

    // Only try IMAP if mailbox exists — validates password via Dovecot
    const valid = await validateCredentials(email, password);
    if (!valid) {
      recordFailure(email);
      const entry = failedAttempts.get(email);
      const remaining = MAX_ATTEMPTS - (entry?.count || 0);
      return reply.status(401).send({ message: remaining > 0 ? `Invalid password. ${remaining} attempt(s) remaining.` : `Too many failed attempts. Account locked for 15 minutes.` });
    }
    clearFailures(email);
    const token = await createSession(email, password);
    return { token, email };
  });

  // POST /api/webmail/forgot-password — mail user requests password reset
  app.post("/forgot-password", { config: { rateLimit: { max: 5, timeWindow: "5 minutes" } } }, async (request, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(request.body);
    const [localPart, emailDomain] = email.split("@");
    if (!localPart || !emailDomain) return { message: "If the account exists, a reset request has been submitted." };

    const { db } = await import("../../db/index.js");
    const { domains, mailboxes, passwordResetRequests } = await import("../../db/schema.js");
    const { eq, and } = await import("drizzle-orm");

    const domain = await db.query.domains.findFirst({ where: eq(domains.domainName, emailDomain) });
    if (!domain) return { message: "If the account exists, a reset request has been submitted." };

    const mailbox = await db.query.mailboxes.findFirst({
      where: and(eq(mailboxes.domainId, domain.id), eq(mailboxes.localPart, localPart.toLowerCase())),
    });
    if (!mailbox) return { message: "If the account exists, a reset request has been submitted." };

    // Check for existing pending request
    const existing = await db.query.passwordResetRequests.findFirst({
      where: and(eq(passwordResetRequests.email, email.toLowerCase()), eq(passwordResetRequests.status, "pending")),
    });

    if (!existing) {
      await db.insert(passwordResetRequests).values({
        requestType: "mailbox",
        mailboxId: mailbox.id,
        clientId: mailbox.clientId,
        email: email.toLowerCase(),
      });
    }

    return { message: "If the account exists, a reset request has been submitted." };
  });

  app.post("/logout", async (request) => {
    const token = getSessionToken(request as any);
    if (token) await destroySession(token);
    return { message: "Logged out" };
  });

  // ==========================================
  // FOLDERS
  // ==========================================

  app.get("/folders", async (request, reply) => {
    const ctx = await authed(request, reply);
    if (!ctx) return;
    const { client } = ctx;

    const folders = [];
    const list = await client.list();
    for (const folder of list) {
      try {
        const status = await client.status(folder.path, { messages: true, unseen: true });
        folders.push({ name: folder.name, path: folder.path, specialUse: folder.specialUse || null, messages: status.messages ?? 0, unseen: status.unseen ?? 0 });
      } catch {
        folders.push({ name: folder.name, path: folder.path, specialUse: folder.specialUse || null, messages: 0, unseen: 0 });
      }
    }
    return folders;
  });

  // ==========================================
  // MESSAGE LIST
  // ==========================================

  app.get("/messages", async (request, reply) => {
    const ctx = await authed(request, reply);
    if (!ctx) return;
    const { client } = ctx;

    const { folder = "INBOX", page = "1", limit = "50" } = request.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const lock = await client.getMailboxLock(folder);
    try {
      const status = await client.status(folder, { messages: true });
      const total = status.messages ?? 0;
      if (total === 0) return { messages: [], total, page: pageNum, limit: limitNum };

      const end = Math.max(1, total - (pageNum - 1) * limitNum);
      const start = Math.max(1, end - limitNum + 1);

      const messages: any[] = [];
      for await (const msg of client.fetch(`${start}:${end}`, {
        uid: true, envelope: true, flags: true, bodyStructure: true, size: true,
      })) {
        const env = msg.envelope;
        messages.push({
          uid: msg.uid, seq: msg.seq,
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
  });

  // ==========================================
  // MESSAGE DETAIL
  // ==========================================

  app.get<{ Params: { uid: string } }>("/message/:uid", async (request, reply) => {
    const ctx = await authed(request, reply);
    if (!ctx) return;
    const { client } = ctx;

    const { folder = "INBOX" } = request.query as Record<string, string>;
    const uid = parseInt(request.params.uid);

    const lock = await client.getMailboxLock(folder);
    try {
      await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
      const msg = await client.fetchOne(`${uid}`, { uid: true, source: true, flags: true, envelope: true }, { uid: true });
      if (!msg) return reply.status(404).send({ message: "Message not found" });

      const parsed: ParsedMail = await simpleParser((msg as any).source);

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
        attachments: (parsed.attachments || []).map((att, i) => {
          const isImage = (att.contentType || "").startsWith("image/");
          return {
            id: i, filename: att.filename || `attachment-${i}`,
            contentType: att.contentType || "application/octet-stream",
            size: att.size || 0, isImage,
            preview: isImage ? `data:${att.contentType};base64,${att.content.toString("base64")}` : undefined,
          };
        }),
        inReplyTo: parsed.inReplyTo || null,
        references: parsed.references ? (Array.isArray(parsed.references) ? parsed.references.join(" ") : parsed.references) : null,
      };
    } finally {
      lock.release();
    }
  });

  // ==========================================
  // ATTACHMENT DOWNLOAD
  // ==========================================

  app.get<{ Params: { uid: string; attachmentId: string } }>("/message/:uid/attachment/:attachmentId", async (request, reply) => {
    const ctx = await authed(request, reply);
    if (!ctx) return;
    const { client } = ctx;

    const query = request.query as Record<string, string>;
    const folder = query.folder || "INBOX";
    const uid = parseInt(request.params.uid);
    const attId = parseInt(request.params.attachmentId);

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
  });

  // ==========================================
  // SEND
  // ==========================================

  app.post("/send", async (request, reply) => {
    const ctx = await authed(request, reply);
    if (!ctx) return;
    const { client, session } = ctx;

    const body = composeSchema.parse(request.body);

    const transporter = createTransport({
      host: "127.0.0.1", port: 587, secure: false,
      auth: { user: session.email, pass: session.password },
      tls: { rejectUnauthorized: false },
    });

    const mailOptions: any = {
      from: session.email, to: body.to, subject: body.subject,
      text: body.text, html: body.html || undefined,
      cc: body.cc || undefined, bcc: body.bcc || undefined,
      inReplyTo: body.inReplyTo || undefined,
      references: body.references || undefined,
    };

    if (body.attachments?.length) {
      mailOptions.attachments = body.attachments.map((att) => ({
        filename: att.filename, content: Buffer.from(att.content, "base64"), contentType: att.contentType,
      }));
    }

    await transporter.sendMail(mailOptions);

    // Save to Sent folder
    try {
      const MailComposer = (await import("nodemailer/lib/mail-composer/index.js")).default;
      const composer = new MailComposer(mailOptions);
      const raw = await new Promise<Buffer>((resolve, reject) => {
        composer.compile().build((err: Error | null, message: Buffer) => {
          if (err) reject(err); else resolve(message);
        });
      });
      await client.append("Sent", raw, ["\\Seen"]);
    } catch {}

    return { message: "Email sent" };
  });

  // ==========================================
  // MOVE / DELETE / FLAG
  // ==========================================

  app.post("/move", async (request, reply) => {
    const ctx = await authed(request, reply);
    if (!ctx) return;
    const { client } = ctx;

    const { uids, fromFolder, toFolder } = z.object({
      uids: z.array(z.number()).min(1), fromFolder: z.string(), toFolder: z.string(),
    }).parse(request.body);

    const lock = await client.getMailboxLock(fromFolder);
    try {
      for (const uid of uids) await client.messageMove({ uid }, toFolder, { uid: true });
    } finally { lock.release(); }
    return { message: `${uids.length} message(s) moved` };
  });

  app.post("/delete", async (request, reply) => {
    const ctx = await authed(request, reply);
    if (!ctx) return;
    const { client } = ctx;

    const { uids, folder } = z.object({
      uids: z.array(z.number()).min(1), folder: z.string(),
    }).parse(request.body);

    const lock = await client.getMailboxLock(folder);
    try {
      for (const uid of uids) await client.messageDelete({ uid }, { uid: true });
    } finally { lock.release(); }
    return { message: `${uids.length} message(s) permanently deleted` };
  });

  app.post("/flag", async (request, reply) => {
    const ctx = await authed(request, reply);
    if (!ctx) return;
    const { client } = ctx;

    const { uids, folder, flag, add } = z.object({
      uids: z.array(z.number()).min(1), folder: z.string(), flag: z.string(), add: z.boolean(),
    }).parse(request.body);

    const lock = await client.getMailboxLock(folder);
    try {
      for (const uid of uids) {
        if (add) await client.messageFlagsAdd({ uid }, [flag], { uid: true });
        else await client.messageFlagsRemove({ uid }, [flag], { uid: true });
      }
    } finally { lock.release(); }
    return { message: "Flags updated" };
  });

  // ==========================================
  // SEARCH
  // ==========================================

  app.get("/search", async (request, reply) => {
    const ctx = await authed(request, reply);
    if (!ctx) return;
    const { client } = ctx;

    const { folder = "INBOX", q = "" } = request.query as Record<string, string>;
    if (!q.trim()) return { messages: [], total: 0 };

    const lock = await client.getMailboxLock(folder);
    try {
      const searchResult = await client.search({
        or: [{ subject: q }, { from: q }, { to: q }, { body: q }],
      });
      const results = Array.isArray(searchResult) ? searchResult : [];
      if (results.length === 0) return { messages: [], total: 0 };

      const uids = results.slice(-100);
      const messages: any[] = [];
      for await (const msg of client.fetch(uids.map(String).join(","), {
        uid: true, envelope: true, flags: true, size: true,
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
  });

  // ==========================================
  // DRAFTS
  // ==========================================

  app.post("/draft", async (request, reply) => {
    const ctx = await authed(request, reply);
    if (!ctx) return;
    const { client, session } = ctx;

    const body = composeSchema.parse(request.body);
    const MailComposer = (await import("nodemailer/lib/mail-composer/index.js")).default;

    const mailOptions: any = {
      from: session.email, to: body.to || undefined, subject: body.subject,
      text: body.text, html: body.html || undefined, cc: body.cc || undefined,
    };
    if (body.attachments?.length) {
      mailOptions.attachments = body.attachments.map((att: any) => ({
        filename: att.filename, content: Buffer.from(att.content, "base64"), contentType: att.contentType,
      }));
    }

    const composer = new MailComposer(mailOptions);
    const raw = await new Promise<Buffer>((resolve, reject) => {
      composer.compile().build((err: Error | null, message: Buffer) => {
        if (err) reject(err); else resolve(message);
      });
    });

    const result = await client.append("Drafts", raw, ["\\Draft", "\\Seen"]);
    return { message: "Draft saved", uid: result && typeof result === "object" ? (result as any).uid : undefined };
  });

  app.delete<{ Params: { uid: string } }>("/draft/:uid", async (request, reply) => {
    const ctx = await authed(request, reply);
    if (!ctx) return;
    const { client } = ctx;

    const uid = parseInt(request.params.uid);
    const lock = await client.getMailboxLock("Drafts");
    try {
      await client.messageDelete({ uid }, { uid: true });
    } finally { lock.release(); }
    return { message: "Draft deleted" };
  });

  // ==========================================
  // CHANGE PASSWORD
  // ==========================================

  app.post("/change-password", async (request, reply) => {
    const session = await getSession(request as any);
    if (!session) return reply.status(401).send({ message: "Unauthorized" });

    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(128),
    }).parse(request.body);

    if (currentPassword !== session.password) {
      return reply.status(400).send({ message: "Current password is incorrect" });
    }

    // Update password in DB via doveadm
    const { hashPasswordForDovecot } = await import("../../lib/password.js");
    const { db } = await import("../../db/index.js");
    const { mailboxes } = await import("../../db/schema.js");
    const { eq, and } = await import("drizzle-orm");

    const email = session.email;
    const [localPart, domain] = email.split("@");
    const newHash = hashPasswordForDovecot(newPassword);

    // Find and update mailbox
    const { domains } = await import("../../db/schema.js");
    const domainRow = await db.query.domains.findFirst({ where: eq(domains.domainName, domain) });
    if (!domainRow) return reply.status(404).send({ message: "Domain not found" });

    await db.update(mailboxes).set({ passwordHash: newHash, updatedAt: new Date() })
      .where(and(eq(mailboxes.domainId, domainRow.id), eq(mailboxes.localPart, localPart)));

    // Update session with new password
    const token = getSessionToken(request as any)!;
    await destroySession(token);
    const newToken = await createSession(email, newPassword);

    return { message: "Password changed successfully", token: newToken };
  });

  // ==========================================
  // ENSURE FOLDER EXISTS (for Archive)
  // ==========================================

  app.post("/ensure-folder", async (request, reply) => {
    const ctx = await authed(request, reply);
    if (!ctx) return;
    const { client } = ctx;

    const { folder } = z.object({ folder: z.string().min(1) }).parse(request.body);

    try {
      await client.mailboxCreate(folder);
    } catch {
      // Folder already exists — fine
    }
    return { message: "Folder ready" };
  });
}
