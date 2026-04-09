import { eq, and, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { mailboxes, domains, clients, plans } from "../../db/schema.js";
import { NotFoundError, ConflictError, LimitExceededError } from "../../lib/errors.js";
import { hashPasswordForDovecot } from "../../lib/password.js";
import { logAudit } from "../../lib/audit.js";
import { reloadPostfix, reloadDovecot } from "../../mail/postfix.js";

interface CreateMailboxInput {
  localPart: string;
  password: string;
  displayName?: string;
  quotaMb?: number;
}

interface UpdateMailboxInput {
  password?: string;
  displayName?: string;
  quotaMb?: number;
  status?: string;
}

export async function listMailboxes(domainId: string) {
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
    .where(eq(mailboxes.domainId, domainId))
    .orderBy(mailboxes.localPart);
}

export async function getMailbox(id: string) {
  const [mailbox] = await db
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
    .where(eq(mailboxes.id, id));

  if (!mailbox) throw new NotFoundError("Mailbox", id);
  return mailbox;
}

export async function createMailbox(domainId: string, input: CreateMailboxInput) {
  // Get domain and client info for limit checking
  const domain = await db.query.domains.findFirst({
    where: eq(domains.id, domainId),
    with: { client: { with: { plan: true } } },
  });
  if (!domain) throw new NotFoundError("Domain", domainId);

  // Check plan limit (only count active mailboxes)
  const [count] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(mailboxes)
    .where(and(eq(mailboxes.clientId, domain.clientId), eq(mailboxes.status, "active")));

  const maxMailboxes = domain.client?.plan?.maxMailboxes ?? 50;
  if (count.count >= maxMailboxes) {
    throw new LimitExceededError("Mailboxes", maxMailboxes);
  }

  // Check uniqueness within domain
  const existing = await db.query.mailboxes.findFirst({
    where: and(
      eq(mailboxes.domainId, domainId),
      eq(mailboxes.localPart, input.localPart.toLowerCase()),
    ),
  });
  if (existing) {
    throw new ConflictError(
      `Mailbox '${input.localPart}@${domain.domainName}' already exists`,
    );
  }

  // Hash password in Dovecot-compatible format
  const passwordHash = hashPasswordForDovecot(input.password);

  const [mailbox] = await db
    .insert(mailboxes)
    .values({
      domainId,
      clientId: domain.clientId,
      localPart: input.localPart.toLowerCase(),
      passwordHash,
      displayName: input.displayName,
      quotaMb: input.quotaMb ?? domain.client?.plan?.storagePerMailboxMb ?? 500,
    })
    .returning();

  // Reload mail services so they pick up the new mailbox
  await reloadPostfix();
  await reloadDovecot();

  logAudit({ actorType: "system", action: "mailbox.created", targetType: "mailbox", targetId: mailbox.id, details: { email: `${input.localPart}@${domain.domainName}`, domainId } });

  return mailbox;
}

export async function updateMailbox(id: string, input: UpdateMailboxInput) {
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (input.password) {
    updates.passwordHash = hashPasswordForDovecot(input.password);
  }
  if (input.displayName !== undefined) updates.displayName = input.displayName;
  if (input.quotaMb !== undefined) updates.quotaMb = input.quotaMb;
  if (input.status !== undefined) updates.status = input.status;

  const [mailbox] = await db
    .update(mailboxes)
    .set(updates)
    .where(eq(mailboxes.id, id))
    .returning();

  if (!mailbox) throw new NotFoundError("Mailbox", id);

  // Invalidate IMAP pool if password changed
  if (input.password) {
    try {
      const domain = await db.query.domains.findFirst({ where: eq(domains.id, mailbox.domainId) });
      if (domain) {
        const { invalidateByEmail } = await import("../webmail/imap-pool.js");
        invalidateByEmail(`${mailbox.localPart}@${domain.domainName}`);
      }
    } catch {}
  }

  await reloadDovecot();
  return mailbox;
}

export async function deleteMailbox(id: string) {
  const [mailbox] = await db
    .update(mailboxes)
    .set({ status: "disabled", updatedAt: new Date() })
    .where(eq(mailboxes.id, id))
    .returning();
  if (!mailbox) throw new NotFoundError("Mailbox", id);

  await reloadPostfix();
  await reloadDovecot();
  return mailbox;
}
