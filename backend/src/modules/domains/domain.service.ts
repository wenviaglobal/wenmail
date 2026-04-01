import { eq, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { generateKeyPairSync } from "node:crypto";
import { db } from "../../db/index.js";
import { domains, dnsChecks, clients, plans } from "../../db/schema.js";
import { NotFoundError, ConflictError, LimitExceededError } from "../../lib/errors.js";
import * as dnsService from "./dns.service.js";

export async function listDomains(clientId: string) {
  return db.query.domains.findMany({
    where: eq(domains.clientId, clientId),
    orderBy: (d, { desc }) => [desc(d.createdAt)],
  });
}

export async function getDomain(id: string) {
  const domain = await db.query.domains.findFirst({
    where: eq(domains.id, id),
    with: { client: true },
  });
  if (!domain) throw new NotFoundError("Domain", id);
  return domain;
}

export async function createDomain(clientId: string, domainName: string) {
  // Check plan limit
  const client = await db.query.clients.findFirst({
    where: eq(clients.id, clientId),
    with: { plan: true },
  });
  if (!client) throw new NotFoundError("Client", clientId);

  const domainCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(domains)
    .where(eq(domains.clientId, clientId));

  if (domainCount[0].count >= (client.plan?.maxDomains ?? 1)) {
    throw new LimitExceededError("Domains", client.plan?.maxDomains ?? 1);
  }

  // Check uniqueness
  const existing = await db.query.domains.findFirst({
    where: eq(domains.domainName, domainName.toLowerCase()),
  });
  if (existing) throw new ConflictError(`Domain '${domainName}' is already registered`);

  // Generate verification token
  const verificationToken = nanoid(32);

  // Generate DKIM keypair
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const [domain] = await db
    .insert(domains)
    .values({
      clientId,
      domainName: domainName.toLowerCase(),
      verificationToken,
      dkimPrivateKey: privateKey,
      dkimPublicKey: publicKey,
    })
    .returning();

  return domain;
}

export async function verifyDomain(id: string) {
  const domain = await getDomain(id);

  const results = await dnsService.checkAllDns(
    domain.domainName,
    domain.verificationToken,
    domain.dkimSelector ?? "mail",
  );

  // Store check results
  for (const result of results) {
    await db.insert(dnsChecks).values({
      domainId: id,
      checkType: result.type,
      status: result.pass ? "pass" : "fail",
      rawResult: result.raw,
    });
  }

  // Update domain status flags
  const verifyResult = results.find((r) => r.type === "verify");
  const mxResult = results.find((r) => r.type === "mx");
  const spfResult = results.find((r) => r.type === "spf");
  const dkimResult = results.find((r) => r.type === "dkim");
  const dmarcResult = results.find((r) => r.type === "dmarc");

  const isVerified = verifyResult?.pass ?? false;
  const allConfigured = [mxResult, spfResult, dkimResult, dmarcResult].every(
    (r) => r?.pass,
  );

  const [updated] = await db
    .update(domains)
    .set({
      verified: isVerified,
      mxConfigured: mxResult?.pass ?? false,
      spfConfigured: spfResult?.pass ?? false,
      dkimConfigured: dkimResult?.pass ?? false,
      dmarcConfigured: dmarcResult?.pass ?? false,
      status: isVerified && allConfigured ? "active" : isVerified ? "verified" : "pending",
      verifiedAt: isVerified ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(domains.id, id))
    .returning();

  return { domain: updated, results };
}

export async function getDnsStatus(id: string) {
  const domain = await getDomain(id);
  return dnsService.checkAllDns(
    domain.domainName,
    domain.verificationToken,
    domain.dkimSelector ?? "mail",
  );
}

export async function deleteDomain(id: string) {
  const [domain] = await db
    .update(domains)
    .set({ status: "disabled", updatedAt: new Date() })
    .where(eq(domains.id, id))
    .returning();
  if (!domain) throw new NotFoundError("Domain", id);
  return domain;
}
