import { eq, and, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { aliases, domains, clients } from "../../db/schema.js";
import { NotFoundError, ConflictError, LimitExceededError } from "../../lib/errors.js";
import { reloadPostfix } from "../../mail/postfix.js";

interface CreateAliasInput {
  sourceLocal: string;
  destination: string; // comma-separated emails
}

export async function listAliases(domainId: string) {
  return db
    .select({
      id: aliases.id,
      sourceLocal: aliases.sourceLocal,
      domainName: domains.domainName,
      destination: aliases.destination,
      status: aliases.status,
      createdAt: aliases.createdAt,
    })
    .from(aliases)
    .innerJoin(domains, eq(aliases.domainId, domains.id))
    .where(eq(aliases.domainId, domainId))
    .orderBy(aliases.sourceLocal);
}

export async function createAlias(domainId: string, input: CreateAliasInput) {
  const domain = await db.query.domains.findFirst({
    where: eq(domains.id, domainId),
    with: { client: { with: { plan: true } } },
  });
  if (!domain) throw new NotFoundError("Domain", domainId);

  // Check plan limit
  const [count] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(aliases)
    .where(eq(aliases.clientId, domain.clientId));

  const maxAliases = domain.client?.plan?.maxAliases ?? 200;
  if (count.count >= maxAliases) {
    throw new LimitExceededError("Aliases", maxAliases);
  }

  // Check uniqueness
  const existing = await db.query.aliases.findFirst({
    where: and(
      eq(aliases.domainId, domainId),
      eq(aliases.sourceLocal, input.sourceLocal.toLowerCase()),
    ),
  });
  if (existing) {
    throw new ConflictError(
      `Alias '${input.sourceLocal}@${domain.domainName}' already exists`,
    );
  }

  const [alias] = await db
    .insert(aliases)
    .values({
      domainId,
      clientId: domain.clientId,
      sourceLocal: input.sourceLocal.toLowerCase(),
      destination: input.destination,
    })
    .returning();

  await reloadPostfix();
  return alias;
}

export async function deleteAlias(id: string) {
  const [alias] = await db.delete(aliases).where(eq(aliases.id, id)).returning();
  if (!alias) throw new NotFoundError("Alias", id);
  await reloadPostfix();
  return alias;
}
