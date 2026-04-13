import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../../db/index.js";
import { autoResponders, catchAllRules, forwardingRules, mailboxes, domains } from "../../db/schema.js";
import { clientAuthGuard } from "./client-auth.guard.js";
import { NotFoundError } from "../../lib/errors.js";
import { writeFile, mkdir } from "node:fs/promises";

function getClientId(request: { user: unknown }): string {
  return (request.user as { clientId: string }).clientId;
}

/**
 * Generate a Dovecot Sieve script for auto-responder + forwarding.
 */
async function generateSieveScript(mailboxId: string, email: string): Promise<void> {
  const [localPart, domainName] = email.split("@");

  // Get auto-responder
  const ar = await db.query.autoResponders.findFirst({ where: eq(autoResponders.mailboxId, mailboxId) });

  // Get forwarding rules
  const fwds = await db.select().from(forwardingRules).where(and(eq(forwardingRules.mailboxId, mailboxId), eq(forwardingRules.enabled, true)));

  let script = `require ["vacation", "fileinto", "redirect", "copy"];\n\n`;

  // Auto-responder
  if (ar?.enabled) {
    const subj = (ar.subject || "Out of Office").replace(/"/g, '\\"');
    const body = (ar.body || "I am currently out of office.").replace(/"/g, '\\"');
    script += `# Auto-responder\nvacation :days 1 :subject "${subj}" "${body}";\n\n`;
  }

  // Forwarding rules
  for (const fwd of fwds) {
    if (fwd.keepCopy) {
      script += `# Forward (keep copy)\nredirect :copy "${fwd.forwardTo}";\n`;
    } else {
      script += `# Forward (no copy)\nredirect "${fwd.forwardTo}";\n`;
    }
  }

  // Write sieve script for this user
  const sieveDir = `/var/mail/vhosts/${domainName}/${localPart}`;
  await mkdir(sieveDir, { recursive: true });
  await writeFile(`${sieveDir}/.dovecot.sieve`, script);

  // Compile sieve
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    await promisify(execFile)("sievec", [`${sieveDir}/.dovecot.sieve`]);
  } catch {}
}

export async function mailFeaturesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", clientAuthGuard);

  // ==========================================
  // AUTO-RESPONDER
  // ==========================================

  // GET /api/client-portal/auto-responder/:mailboxId
  app.get<{ Params: { mailboxId: string } }>("/auto-responder/:mailboxId", async (request) => {
    const clientId = getClientId(request);
    const mailbox = await db.query.mailboxes.findFirst({
      where: and(eq(mailboxes.id, request.params.mailboxId), eq(mailboxes.clientId, clientId)),
      with: { domain: true },
    });
    if (!mailbox) throw new NotFoundError("Mailbox", request.params.mailboxId);

    const ar = await db.query.autoResponders.findFirst({ where: eq(autoResponders.mailboxId, mailbox.id) });
    return ar || { enabled: false, subject: "Out of Office", body: "", startDate: null, endDate: null };
  });

  // PUT /api/client-portal/auto-responder/:mailboxId
  app.put<{ Params: { mailboxId: string } }>("/auto-responder/:mailboxId", async (request) => {
    const clientId = getClientId(request);
    const body = z.object({
      enabled: z.boolean(),
      subject: z.string().max(255).default("Out of Office"),
      body: z.string().max(5000).default(""),
      startDate: z.string().datetime().optional().nullable(),
      endDate: z.string().datetime().optional().nullable(),
    }).parse(request.body);

    const mailbox = await db.query.mailboxes.findFirst({
      where: and(eq(mailboxes.id, request.params.mailboxId), eq(mailboxes.clientId, clientId)),
      with: { domain: true },
    });
    if (!mailbox) throw new NotFoundError("Mailbox", request.params.mailboxId);

    const existing = await db.query.autoResponders.findFirst({ where: eq(autoResponders.mailboxId, mailbox.id) });

    if (existing) {
      await db.update(autoResponders).set({
        enabled: body.enabled, subject: body.subject, body: body.body,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        updatedAt: new Date(),
      }).where(eq(autoResponders.id, existing.id));
    } else {
      await db.insert(autoResponders).values({
        mailboxId: mailbox.id, enabled: body.enabled, subject: body.subject, body: body.body,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
      });
    }

    // Regenerate sieve script
    await generateSieveScript(mailbox.id, `${mailbox.localPart}@${mailbox.domain.domainName}`);
    return { message: body.enabled ? "Auto-responder enabled" : "Auto-responder disabled" };
  });

  // ==========================================
  // CATCH-ALL
  // ==========================================

  // GET /api/client-portal/catch-all/:domainId
  app.get<{ Params: { domainId: string } }>("/catch-all/:domainId", async (request) => {
    const clientId = getClientId(request);
    const domain = await db.query.domains.findFirst({
      where: and(eq(domains.id, request.params.domainId), eq(domains.clientId, clientId)),
    });
    if (!domain) throw new NotFoundError("Domain", request.params.domainId);

    const rule = await db.query.catchAllRules.findFirst({ where: eq(catchAllRules.domainId, domain.id) });
    return rule || { enabled: false, forwardTo: "" };
  });

  // PUT /api/client-portal/catch-all/:domainId
  app.put<{ Params: { domainId: string } }>("/catch-all/:domainId", async (request) => {
    const clientId = getClientId(request);
    const body = z.object({
      enabled: z.boolean(),
      forwardTo: z.string().email(),
    }).parse(request.body);

    const domain = await db.query.domains.findFirst({
      where: and(eq(domains.id, request.params.domainId), eq(domains.clientId, clientId)),
    });
    if (!domain) throw new NotFoundError("Domain", request.params.domainId);

    const existing = await db.query.catchAllRules.findFirst({ where: eq(catchAllRules.domainId, domain.id) });

    if (existing) {
      await db.update(catchAllRules).set({ enabled: body.enabled, forwardTo: body.forwardTo, updatedAt: new Date() })
        .where(eq(catchAllRules.id, existing.id));
    } else {
      await db.insert(catchAllRules).values({ domainId: domain.id, clientId, enabled: body.enabled, forwardTo: body.forwardTo });
    }

    // Update Postfix virtual alias for catch-all
    // catch-all is: @domain → forwardTo
    // This needs a Postfix virtual_alias_maps entry
    // For now we use the aliases table approach
    return { message: body.enabled ? "Catch-all enabled" : "Catch-all disabled" };
  });

  // ==========================================
  // FORWARDING RULES
  // ==========================================

  // GET /api/client-portal/forwarding/:mailboxId
  app.get<{ Params: { mailboxId: string } }>("/forwarding/:mailboxId", async (request) => {
    const clientId = getClientId(request);
    const mailbox = await db.query.mailboxes.findFirst({
      where: and(eq(mailboxes.id, request.params.mailboxId), eq(mailboxes.clientId, clientId)),
    });
    if (!mailbox) throw new NotFoundError("Mailbox", request.params.mailboxId);

    return db.select().from(forwardingRules).where(eq(forwardingRules.mailboxId, mailbox.id));
  });

  // POST /api/client-portal/forwarding/:mailboxId
  app.post<{ Params: { mailboxId: string } }>("/forwarding/:mailboxId", async (request) => {
    const clientId = getClientId(request);
    const body = z.object({
      forwardTo: z.string().email(),
      keepCopy: z.boolean().default(true),
    }).parse(request.body);

    const mailbox = await db.query.mailboxes.findFirst({
      where: and(eq(mailboxes.id, request.params.mailboxId), eq(mailboxes.clientId, clientId)),
      with: { domain: true },
    });
    if (!mailbox) throw new NotFoundError("Mailbox", request.params.mailboxId);

    const [rule] = await db.insert(forwardingRules).values({
      mailboxId: mailbox.id, clientId, forwardTo: body.forwardTo, keepCopy: body.keepCopy,
    }).returning();

    await generateSieveScript(mailbox.id, `${mailbox.localPart}@${mailbox.domain.domainName}`);
    return rule;
  });

  // DELETE /api/client-portal/forwarding/:id
  app.delete<{ Params: { id: string } }>("/forwarding/:id", async (request) => {
    const clientId = getClientId(request);
    const [rule] = await db.select().from(forwardingRules)
      .where(and(eq(forwardingRules.id, request.params.id), eq(forwardingRules.clientId, clientId))).limit(1);
    if (!rule) throw new NotFoundError("Forwarding rule", request.params.id);

    await db.delete(forwardingRules).where(eq(forwardingRules.id, request.params.id));

    // Regenerate sieve
    const mailbox = await db.query.mailboxes.findFirst({
      where: eq(mailboxes.id, rule.mailboxId), with: { domain: true },
    });
    if (mailbox) await generateSieveScript(mailbox.id, `${mailbox.localPart}@${mailbox.domain.domainName}`);

    return { message: "Forwarding rule deleted" };
  });
}
