import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  clients, domains, mailboxes, aliases, mailLogs, plans,
  invoices, payments,
} from "../../db/schema.js";
import { clientAuthGuard } from "./client-auth.guard.js";
import { NotFoundError, ConflictError, LimitExceededError, AppError } from "../../lib/errors.js";
import { buildDnsInstructions } from "../settings/settings.service.js";
import { hashPasswordForDovecot } from "../../lib/password.js";
import { reloadPostfix, reloadDovecot } from "../../mail/postfix.js";
import { sendWelcomeEmail } from "../../mail/welcome.js";
import * as dnsService from "../domains/dns.service.js";
import { logger } from "../../lib/logger.js";
import { nanoid } from "nanoid";
import { generateKeyPairSync } from "node:crypto";
import { env } from "../../config/env.js";

// Helper: extract clientId from JWT
function getClientId(request: { user: unknown }): string {
  return (request.user as { clientId: string }).clientId;
}

// Helper: get client with plan for limit checks
async function getClientWithPlan(clientId: string) {
  const client = await db.query.clients.findFirst({
    where: eq(clients.id, clientId),
    with: { plan: true },
  });
  if (!client) throw new NotFoundError("Client", clientId);
  if (client.status !== "active") {
    throw new AppError(403, "Your organization's service is suspended", "SERVICE_SUSPENDED");
  }
  return client;
}

export async function portalRoutes(app: FastifyInstance) {
  app.addHook("preHandler", clientAuthGuard);

  // ==========================================
  // DASHBOARD
  // ==========================================

  // GET /api/client-portal/dashboard
  app.get("/dashboard", async (request) => {
    const clientId = getClientId(request);

    const [[domainCount], [mailboxCount], [aliasCount], client] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(domains).where(eq(domains.clientId, clientId)),
      db.select({ count: sql<number>`COUNT(*)` }).from(mailboxes).where(eq(mailboxes.clientId, clientId)),
      db.select({ count: sql<number>`COUNT(*)` }).from(aliases).where(eq(aliases.clientId, clientId)),
      db.query.clients.findFirst({ where: eq(clients.id, clientId), with: { plan: true } }),
    ]);

    return {
      domains: domainCount.count,
      mailboxes: mailboxCount.count,
      aliases: aliasCount.count,
      plan: client?.plan,
      limits: {
        maxDomains: client?.maxDomainOverride ?? client?.plan?.maxDomains ?? 1,
        maxMailboxes: client?.maxMailboxOverride ?? client?.plan?.maxMailboxes ?? 50,
        maxAliases: client?.plan?.maxAliases ?? 200,
        storagePerMailboxMb: client?.plan?.storagePerMailboxMb ?? 500,
      },
    };
  });

  // ==========================================
  // DOMAINS — client manages their own
  // ==========================================

  // GET /api/client-portal/domains
  app.get("/domains", async (request) => {
    const clientId = getClientId(request);
    return db.query.domains.findMany({
      where: eq(domains.clientId, clientId),
      orderBy: (d, { desc }) => [desc(d.createdAt)],
    });
  });

  // POST /api/client-portal/domains
  app.post("/domains", async (request, reply) => {
    const clientId = getClientId(request);
    const { domainName } = z.object({
      domainName: z.string().min(3).max(255).regex(/^[a-z0-9]+([\-.][a-z0-9]+)*\.[a-z]{2,}$/),
    }).parse(request.body);

    const client = await getClientWithPlan(clientId);
    const maxDomains = client.maxDomainOverride ?? client.plan?.maxDomains ?? 1;

    const [count] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(domains)
      .where(eq(domains.clientId, clientId));
    if (count.count >= maxDomains) throw new LimitExceededError("Domains", maxDomains);

    const existing = await db.query.domains.findFirst({
      where: eq(domains.domainName, domainName.toLowerCase()),
    });
    if (existing) throw new ConflictError(`Domain '${domainName}' is already registered`);

    const verificationToken = nanoid(32);
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    const [domain] = await db.insert(domains).values({
      clientId,
      domainName: domainName.toLowerCase(),
      verificationToken,
      dkimPrivateKey: privateKey,
      dkimPublicKey: publicKey,
    }).returning();

    const dkimPub = publicKey
      .replace("-----BEGIN PUBLIC KEY-----", "")
      .replace("-----END PUBLIC KEY-----", "")
      .replace(/\s/g, "");

    return reply.status(201).send({
      domain,
      dnsInstructions: {
        verification: { type: "TXT", host: domainName, value: `mailplatform-verify=${domain.verificationToken}` },
        mx: { type: "MX", host: domainName, value: env.PLATFORM_DOMAIN, priority: 10 },
        spf: { type: "TXT", host: domainName, value: `v=spf1 include:${env.PLATFORM_DOMAIN} ~all` },
        dkim: { type: "TXT", host: `${domain.dkimSelector}._domainkey.${domainName}`, value: `v=DKIM1; k=rsa; p=${dkimPub}` },
        dmarc: { type: "TXT", host: `_dmarc.${domainName}`, value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${env.PLATFORM_DOMAIN}` },
      },
    });
  });

  // POST /api/client-portal/domains/:id/verify
  app.post<{ Params: { id: string } }>("/domains/:id/verify", async (request) => {
    const clientId = getClientId(request);
    const domain = await db.query.domains.findFirst({
      where: and(eq(domains.id, request.params.id), eq(domains.clientId, clientId)),
    });
    if (!domain) throw new NotFoundError("Domain", request.params.id);

    const results = await dnsService.checkAllDns(domain.domainName, domain.verificationToken, domain.dkimSelector ?? "mail");
    const verifyResult = results.find((r) => r.type === "verify");
    const allDns = results.filter((r) => r.type !== "verify");
    const allConfigured = allDns.every((r) => r.pass);
    const isVerified = verifyResult?.pass ?? false;

    await db.update(domains).set({
      verified: isVerified,
      mxConfigured: results.find((r) => r.type === "mx")?.pass ?? false,
      spfConfigured: results.find((r) => r.type === "spf")?.pass ?? false,
      dkimConfigured: results.find((r) => r.type === "dkim")?.pass ?? false,
      dmarcConfigured: results.find((r) => r.type === "dmarc")?.pass ?? false,
      status: isVerified && allConfigured ? "active" : isVerified ? "verified" : "pending",
      verifiedAt: isVerified ? new Date() : undefined,
      updatedAt: new Date(),
    }).where(eq(domains.id, domain.id));

    return { results };
  });

  // GET /api/client-portal/domains/:id/dns-status
  app.get<{ Params: { id: string } }>("/domains/:id/dns-status", async (request) => {
    const clientId = getClientId(request);
    const domain = await db.query.domains.findFirst({
      where: and(eq(domains.id, request.params.id), eq(domains.clientId, clientId)),
    });
    if (!domain) throw new NotFoundError("Domain", request.params.id);
    return dnsService.checkAllDns(domain.domainName, domain.verificationToken, domain.dkimSelector ?? "mail");
  });

  // GET /api/client-portal/domains/:id/dns-guide — personalized setup instructions
  app.get<{ Params: { id: string } }>("/domains/:id/dns-guide", async (request) => {
    const clientId = getClientId(request);
    const domain = await db.query.domains.findFirst({
      where: and(eq(domains.id, request.params.id), eq(domains.clientId, clientId)),
    });
    if (!domain) throw new NotFoundError("Domain", request.params.id);
    return buildDnsInstructions(domain);
  });

  // DELETE /api/client-portal/domains/:id
  app.delete<{ Params: { id: string } }>("/domains/:id", async (request) => {
    const clientId = getClientId(request);
    const [domain] = await db.update(domains)
      .set({ status: "disabled", updatedAt: new Date() })
      .where(and(eq(domains.id, request.params.id), eq(domains.clientId, clientId)))
      .returning();
    if (!domain) throw new NotFoundError("Domain", request.params.id);
    return domain;
  });

  // ==========================================
  // MAILBOXES — client manages their own
  // ==========================================

  // GET /api/client-portal/domains/:domainId/mailboxes
  app.get<{ Params: { domainId: string } }>("/domains/:domainId/mailboxes", async (request) => {
    const clientId = getClientId(request);
    // Verify domain belongs to client
    const domain = await db.query.domains.findFirst({
      where: and(eq(domains.id, request.params.domainId), eq(domains.clientId, clientId)),
    });
    if (!domain) throw new NotFoundError("Domain", request.params.domainId);

    return db
      .select({
        id: mailboxes.id,
        localPart: mailboxes.localPart,
        domainName: domains.domainName,
        displayName: mailboxes.displayName,
        quotaMb: mailboxes.quotaMb,
        storageUsedMb: mailboxes.storageUsedMb,
        status: mailboxes.status,
        lastLoginAt: mailboxes.lastLoginAt,
        createdAt: mailboxes.createdAt,
      })
      .from(mailboxes)
      .innerJoin(domains, eq(mailboxes.domainId, domains.id))
      .where(eq(mailboxes.domainId, request.params.domainId))
      .orderBy(mailboxes.localPart);
  });

  const createMailboxSchema = z.object({
    localPart: z.string().min(1).max(64).regex(/^[a-z0-9]([a-z0-9._%+-]*[a-z0-9])?$/),
    password: z.string().min(8).max(128),
    displayName: z.string().max(255).optional(),
    quotaMb: z.number().int().min(50).max(50000).optional(),
  });

  // POST /api/client-portal/domains/:domainId/mailboxes
  app.post<{ Params: { domainId: string } }>("/domains/:domainId/mailboxes", async (request, reply) => {
    const clientId = getClientId(request);
    const body = createMailboxSchema.parse(request.body);

    const client = await getClientWithPlan(clientId);
    const domain = await db.query.domains.findFirst({
      where: and(eq(domains.id, request.params.domainId), eq(domains.clientId, clientId)),
    });
    if (!domain) throw new NotFoundError("Domain", request.params.domainId);

    // Check plan limit (only count active mailboxes)
    const maxMailboxes = client.maxMailboxOverride ?? client.plan?.maxMailboxes ?? 50;
    const [count] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(mailboxes)
      .where(and(eq(mailboxes.clientId, clientId), eq(mailboxes.status, "active")));
    if (count.count >= maxMailboxes) throw new LimitExceededError("Mailboxes", maxMailboxes);

    // Check uniqueness
    const existing = await db.query.mailboxes.findFirst({
      where: and(eq(mailboxes.domainId, domain.id), eq(mailboxes.localPart, body.localPart.toLowerCase())),
    });
    if (existing) throw new ConflictError(`Mailbox '${body.localPart}@${domain.domainName}' already exists`);

    const passwordHash = hashPasswordForDovecot(body.password);
    const storageLimit = client.plan?.storagePerMailboxMb ?? 500;

    const [mailbox] = await db.insert(mailboxes).values({
      domainId: domain.id,
      clientId,
      localPart: body.localPart.toLowerCase(),
      passwordHash,
      displayName: body.displayName,
      quotaMb: Math.min(body.quotaMb ?? storageLimit, storageLimit),
    }).returning();

    await reloadPostfix();
    await reloadDovecot();

    // Send welcome email with setup instructions (non-blocking)
    const emailAddr = `${mailbox.localPart}@${domain.domainName}`;
    sendWelcomeEmail(emailAddr, body.displayName ?? "").catch(() => {});

    return reply.status(201).send(mailbox);
  });

  const updateMailboxSchema = z.object({
    password: z.string().min(8).max(128).optional(),
    displayName: z.string().max(255).optional(),
    status: z.enum(["active", "disabled"]).optional(),
  });

  // PUT /api/client-portal/mailboxes/:id
  app.put<{ Params: { id: string } }>("/mailboxes/:id", async (request) => {
    const clientId = getClientId(request);
    const body = updateMailboxSchema.parse(request.body);

    const [existing] = await db.select().from(mailboxes)
      .where(and(eq(mailboxes.id, request.params.id), eq(mailboxes.clientId, clientId)));
    if (!existing) throw new NotFoundError("Mailbox", request.params.id);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.password) updates.passwordHash = hashPasswordForDovecot(body.password);
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.status) updates.status = body.status;

    const [mailbox] = await db.update(mailboxes).set(updates).where(eq(mailboxes.id, request.params.id)).returning();
    await reloadDovecot();

    // Invalidate IMAP pool if password changed — forces re-login with new password
    if (body.password && existing.domainId) {
      const dom = await db.query.domains.findFirst({ where: eq(domains.id, existing.domainId) });
      if (dom) {
        const { invalidateByEmail } = await import("../../modules/webmail/imap-pool.js");
        invalidateByEmail(`${existing.localPart}@${dom.domainName}`);
      }
    }

    return mailbox;
  });

  // DELETE /api/client-portal/mailboxes/:id — soft disable
  app.delete<{ Params: { id: string } }>("/mailboxes/:id", async (request) => {
    const clientId = getClientId(request);
    const [mailbox] = await db.update(mailboxes)
      .set({ status: "disabled", updatedAt: new Date() })
      .where(and(eq(mailboxes.id, request.params.id), eq(mailboxes.clientId, clientId)))
      .returning();
    if (!mailbox) throw new NotFoundError("Mailbox", request.params.id);
    await reloadPostfix();
    await reloadDovecot();
    return mailbox;
  });

  // DELETE /api/client-portal/mailboxes/:id/permanent — hard delete (only disabled mailboxes)
  app.delete<{ Params: { id: string } }>("/mailboxes/:id/permanent", async (request) => {
    const clientId = getClientId(request);

    // Only allow permanent delete of disabled mailboxes
    const mailbox = await db.query.mailboxes.findFirst({
      where: and(eq(mailboxes.id, request.params.id), eq(mailboxes.clientId, clientId)),
      with: { domain: true },
    });
    if (!mailbox) throw new NotFoundError("Mailbox", request.params.id);
    if (mailbox.status !== "disabled") {
      throw new AppError(400, "Only disabled mailboxes can be permanently deleted. Disable it first.", "MAILBOX_NOT_DISABLED");
    }

    // Hard delete from DB
    await db.delete(mailboxes).where(eq(mailboxes.id, request.params.id));

    // Remove maildir from disk (non-blocking)
    const emailAddr = `${mailbox.localPart}@${mailbox.domain.domainName}`;
    const maildir = `/var/mail/vhosts/${mailbox.domain.domainName}/${mailbox.localPart}`;
    import("node:child_process").then(({ exec }) => {
      exec(`rm -rf ${maildir}`, (err) => {
        if (err) logger.warn({ maildir, err }, "Failed to remove maildir");
        else logger.info({ emailAddr }, "Maildir removed");
      });
    });

    await reloadPostfix();
    await reloadDovecot();
    return { message: `Mailbox ${emailAddr} permanently deleted` };
  });

  // ==========================================
  // ALIASES — client manages their own
  // ==========================================

  // GET /api/client-portal/domains/:domainId/aliases
  app.get<{ Params: { domainId: string } }>("/domains/:domainId/aliases", async (request) => {
    const clientId = getClientId(request);
    const domain = await db.query.domains.findFirst({
      where: and(eq(domains.id, request.params.domainId), eq(domains.clientId, clientId)),
    });
    if (!domain) throw new NotFoundError("Domain", request.params.domainId);

    return db.select({
      id: aliases.id,
      sourceLocal: aliases.sourceLocal,
      domainName: domains.domainName,
      destination: aliases.destination,
      status: aliases.status,
      createdAt: aliases.createdAt,
    })
    .from(aliases)
    .innerJoin(domains, eq(aliases.domainId, domains.id))
    .where(eq(aliases.domainId, request.params.domainId))
    .orderBy(aliases.sourceLocal);
  });

  const createAliasSchema = z.object({
    sourceLocal: z.string().min(1).max(64).regex(/^[a-z0-9]([a-z0-9._%+-]*[a-z0-9])?$/),
    destination: z.string().min(3).max(1000),
  });

  // POST /api/client-portal/domains/:domainId/aliases
  app.post<{ Params: { domainId: string } }>("/domains/:domainId/aliases", async (request, reply) => {
    const clientId = getClientId(request);
    const body = createAliasSchema.parse(request.body);

    const client = await getClientWithPlan(clientId);
    const domain = await db.query.domains.findFirst({
      where: and(eq(domains.id, request.params.domainId), eq(domains.clientId, clientId)),
    });
    if (!domain) throw new NotFoundError("Domain", request.params.domainId);

    const maxAliases = client.plan?.maxAliases ?? 200;
    const [count] = await db.select({ count: sql<number>`COUNT(*)` }).from(aliases).where(eq(aliases.clientId, clientId));
    if (count.count >= maxAliases) throw new LimitExceededError("Aliases", maxAliases);

    const existing = await db.query.aliases.findFirst({
      where: and(eq(aliases.domainId, domain.id), eq(aliases.sourceLocal, body.sourceLocal.toLowerCase())),
    });
    if (existing) throw new ConflictError(`Alias '${body.sourceLocal}@${domain.domainName}' already exists`);

    const [alias] = await db.insert(aliases).values({
      domainId: domain.id,
      clientId,
      sourceLocal: body.sourceLocal.toLowerCase(),
      destination: body.destination,
    }).returning();

    await reloadPostfix();
    return reply.status(201).send(alias);
  });

  // DELETE /api/client-portal/aliases/:id
  app.delete<{ Params: { id: string } }>("/aliases/:id", async (request) => {
    const clientId = getClientId(request);
    const [alias] = await db.delete(aliases)
      .where(and(eq(aliases.id, request.params.id), eq(aliases.clientId, clientId)))
      .returning();
    if (!alias) throw new NotFoundError("Alias", request.params.id);
    await reloadPostfix();
    return alias;
  });

  // ==========================================
  // MAIL LOGS — client sees their own
  // ==========================================

  // GET /api/client-portal/logs
  app.get("/logs", async (request) => {
    const clientId = getClientId(request);
    const query = request.query as Record<string, string>;
    const page = query.page ? parseInt(query.page) : 1;
    const limit = Math.min(query.limit ? parseInt(query.limit) : 50, 100);
    const offset = (page - 1) * limit;

    // Get client's domain IDs
    const clientDomains = await db.select({ id: domains.id }).from(domains).where(eq(domains.clientId, clientId));
    const domainIds = clientDomains.map((d) => d.id);

    if (domainIds.length === 0) return { data: [], pagination: { page, limit, total: 0, pages: 0 } };

    const [data, total] = await Promise.all([
      db.select().from(mailLogs)
        .where(sql`${mailLogs.domainId} = ANY(${domainIds})`)
        .orderBy(desc(mailLogs.createdAt))
        .limit(limit).offset(offset),
      db.select({ count: sql<number>`COUNT(*)` }).from(mailLogs)
        .where(sql`${mailLogs.domainId} = ANY(${domainIds})`),
    ]);

    return { data, pagination: { page, limit, total: total[0].count, pages: Math.ceil(total[0].count / limit) } };
  });

  // ==========================================
  // BILLING — client views their invoices
  // ==========================================

  // GET /api/client-portal/billing
  app.get("/billing", async (request) => {
    const clientId = getClientId(request);

    const [clientInvoices, clientPayments] = await Promise.all([
      db.select().from(invoices).where(eq(invoices.clientId, clientId)).orderBy(desc(invoices.createdAt)),
      db.select().from(payments).where(eq(payments.clientId, clientId)).orderBy(desc(payments.paidAt)),
    ]);

    return { invoices: clientInvoices, payments: clientPayments };
  });

  // ==========================================
  // IMPORT/EXPORT INFO
  // ==========================================

  // ==========================================
  // MAILBOX PASSWORD RESET REQUESTS
  // ==========================================

  // GET /api/client-portal/password-resets — list pending mailbox reset requests
  app.get("/password-resets", async (request) => {
    const clientId = getClientId(request);
    const { passwordResetRequests } = await import("../../db/schema.js");
    return db
      .select()
      .from(passwordResetRequests)
      .where(and(
        eq(passwordResetRequests.clientId, clientId),
        eq(passwordResetRequests.requestType, "mailbox"),
      ))
      .orderBy(desc(passwordResetRequests.createdAt));
  });

  // GET /api/client-portal/password-resets/pending-count — for dashboard badge
  app.get("/password-resets/pending-count", async (request) => {
    const clientId = getClientId(request);
    const { passwordResetRequests } = await import("../../db/schema.js");
    const [result] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(passwordResetRequests)
      .where(and(
        eq(passwordResetRequests.clientId, clientId),
        eq(passwordResetRequests.requestType, "mailbox"),
        eq(passwordResetRequests.status, "pending"),
      ));
    return { count: result?.count ?? 0 };
  });

  // PUT /api/client-portal/password-resets/:id — resolve (client sets new password)
  app.put<{ Params: { id: string } }>("/password-resets/:id", async (request) => {
    const clientId = getClientId(request);
    const { newPassword } = z.object({ newPassword: z.string().min(8) }).parse(request.body);
    const { passwordResetRequests } = await import("../../db/schema.js");

    const [resetReq] = await db
      .select()
      .from(passwordResetRequests)
      .where(and(eq(passwordResetRequests.id, request.params.id), eq(passwordResetRequests.clientId, clientId)))
      .limit(1);

    if (!resetReq) throw new NotFoundError("Reset request", request.params.id);
    if (!resetReq.mailboxId) throw new AppError(400, "Invalid reset request", "INVALID_REQUEST");

    // Update mailbox password
    const newHash = hashPasswordForDovecot(newPassword);
    await db.update(mailboxes).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(mailboxes.id, resetReq.mailboxId));

    // Mark request as completed
    const user = request.user as { id: string };
    await db.update(passwordResetRequests).set({
      status: "completed",
      resolvedBy: user.id,
      resolvedAt: new Date(),
    }).where(eq(passwordResetRequests.id, request.params.id));

    // Invalidate IMAP pool
    try {
      const { invalidateByEmail } = await import("../../modules/webmail/imap-pool.js");
      invalidateByEmail(resetReq.email);
    } catch {}

    return { message: "Password reset completed" };
  });

  // GET /api/client-portal/migration/info
  // GET /api/client-portal/mail-settings — IMAP/SMTP/webmail info for client setup instructions
  app.get("/mail-settings", async () => {
    const { getSetting } = await import("../settings/settings.service.js");
    const hostname = await getSetting("server.hostname");
    const webmailUrl = await getSetting("server.webmail_url");

    return {
      hostname,
      webmailUrl,
      imap: { server: hostname, port: 993, security: "SSL/TLS" },
      smtp: { server: hostname, port: 587, security: "STARTTLS" },
    };
  });

  app.get("/migration/info", async (request) => {
    const clientId = getClientId(request);
    const client = await getClientWithPlan(clientId);

    return {
      import: {
        method: "IMAP Sync",
        description: "Migrate emails from your previous email provider using IMAP protocol",
        instructions: [
          "Provide your old email server's IMAP address",
          "Provide credentials for the mailbox to import",
          "We will sync all emails to your new mailbox",
          "Contact support to initiate import",
        ],
        supportEmail: `support@${env.PLATFORM_DOMAIN}`,
      },
      export: {
        methods: [
          { name: "IMAP Access", description: "Connect any email client via IMAP to download all emails" },
          { name: "Maildir Export", description: "Request a full archive of your mailbox in Maildir format" },
          { name: "MBOX Export", description: "Request a portable .mbox file for each mailbox" },
        ],
        note: "All your data belongs to you. Contact support to request an export.",
      },
    };
  });
}
