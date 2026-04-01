import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { mailLogs, auditLog, domains } from "../../db/schema.js";

interface LogFilter {
  domainId?: string;
  status?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

export async function getMailLogs(filter: LogFilter) {
  const page = filter.page ?? 1;
  const limit = Math.min(filter.limit ?? 50, 100);
  const offset = (page - 1) * limit;

  const conditions = [];
  if (filter.domainId) conditions.push(eq(mailLogs.domainId, filter.domainId));
  if (filter.status) conditions.push(eq(mailLogs.status, filter.status));
  if (filter.from) conditions.push(gte(mailLogs.createdAt, filter.from));
  if (filter.to) conditions.push(lte(mailLogs.createdAt, filter.to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, total] = await Promise.all([
    db
      .select()
      .from(mailLogs)
      .where(where)
      .orderBy(desc(mailLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(mailLogs)
      .where(where),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total: total[0].count,
      pages: Math.ceil(total[0].count / limit),
    },
  };
}

export async function getAuditLogs(filter: LogFilter) {
  const page = filter.page ?? 1;
  const limit = Math.min(filter.limit ?? 50, 100);
  const offset = (page - 1) * limit;

  const [data, total] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`COUNT(*)` }).from(auditLog),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total: total[0].count,
      pages: Math.ceil(total[0].count / limit),
    },
  };
}
