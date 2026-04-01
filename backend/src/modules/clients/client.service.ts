import { eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { clients, domains, mailboxes, aliases } from "../../db/schema.js";
import { NotFoundError, ConflictError } from "../../lib/errors.js";
import type { CreateClientInput, UpdateClientInput } from "./client.schema.js";

export async function listClients() {
  return db.query.clients.findMany({
    with: { plan: true },
    orderBy: (c, { desc }) => [desc(c.createdAt)],
  });
}

export async function getClient(id: string) {
  const client = await db.query.clients.findFirst({
    where: eq(clients.id, id),
    with: { plan: true, domains: true },
  });
  if (!client) throw new NotFoundError("Client", id);
  return client;
}

export async function getClientStats(id: string) {
  const [stats] = await db
    .select({
      domainCount: sql<number>`(SELECT COUNT(*) FROM domains WHERE client_id = ${id})`,
      mailboxCount: sql<number>`(SELECT COUNT(*) FROM mailboxes WHERE client_id = ${id})`,
      aliasCount: sql<number>`(SELECT COUNT(*) FROM aliases WHERE client_id = ${id})`,
    })
    .from(clients)
    .where(eq(clients.id, id));
  return stats;
}

export async function createClient(input: CreateClientInput) {
  const existing = await db.query.clients.findFirst({
    where: eq(clients.slug, input.slug),
  });
  if (existing) throw new ConflictError(`Client with slug '${input.slug}' already exists`);

  const [client] = await db.insert(clients).values(input).returning();
  return client;
}

export async function updateClient(id: string, input: UpdateClientInput) {
  const [client] = await db
    .update(clients)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(clients.id, id))
    .returning();
  if (!client) throw new NotFoundError("Client", id);
  return client;
}

export async function deleteClient(id: string) {
  const [client] = await db
    .update(clients)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(clients.id, id))
    .returning();
  if (!client) throw new NotFoundError("Client", id);
  return client;
}
