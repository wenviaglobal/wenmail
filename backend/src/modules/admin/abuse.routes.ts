import type { FastifyInstance } from "fastify";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { eq, sql, desc, and, gte } from "drizzle-orm";
import { authGuard } from "../auth/auth.guard.js";
import { db } from "../../db/index.js";
import { mailLogs, mailboxes, domains, clients } from "../../db/schema.js";

const execFileAsync = promisify(execFile);

export async function abuseRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // GET /api/admin/abuse/overview — spam/abuse dashboard
  app.get("/overview", async () => {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get Rspamd stats
    let rspamdStats: any = {};
    try {
      const { stdout } = await execFileAsync("rspamc", ["stat"]);
      const lines = stdout.split("\n");
      for (const line of lines) {
        const match = line.match(/^(.+?):\s+(.+)$/);
        if (match) rspamdStats[match[1].trim()] = match[2].trim();
      }
    } catch {}

    // Outbound mail volume per client (last 24h)
    const outboundByClient = await db
      .select({
        clientId: mailboxes.clientId,
        clientName: clients.name,
        domainName: domains.domainName,
        sent: sql<number>`COUNT(*)`,
      })
      .from(mailLogs)
      .innerJoin(mailboxes, eq(mailLogs.mailboxId, mailboxes.id))
      .innerJoin(domains, eq(mailLogs.domainId, domains.id))
      .innerJoin(clients, eq(mailboxes.clientId, clients.id))
      .where(and(
        eq(mailLogs.direction, "outbound"),
        gte(mailLogs.createdAt, last24h),
      ))
      .groupBy(mailboxes.clientId, clients.name, domains.domainName)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(20);

    // Bounced/failed emails (last 24h) — potential spam indicator
    const bounced = await db
      .select({
        fromAddress: mailLogs.fromAddress,
        domainName: domains.domainName,
        count: sql<number>`COUNT(*)`,
      })
      .from(mailLogs)
      .leftJoin(domains, eq(mailLogs.domainId, domains.id))
      .where(and(
        eq(mailLogs.status, "bounced"),
        gte(mailLogs.createdAt, last24h),
      ))
      .groupBy(mailLogs.fromAddress, domains.domainName)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(20);

    // High-volume senders (last 24h) — potential abuse
    const highVolume = await db
      .select({
        fromAddress: mailLogs.fromAddress,
        domainName: domains.domainName,
        clientName: clients.name,
        sent: sql<number>`COUNT(*)`,
      })
      .from(mailLogs)
      .leftJoin(domains, eq(mailLogs.domainId, domains.id))
      .leftJoin(clients, eq(domains.clientId, clients.id))
      .where(and(
        eq(mailLogs.direction, "outbound"),
        gte(mailLogs.createdAt, last24h),
      ))
      .groupBy(mailLogs.fromAddress, domains.domainName, clients.name)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10);

    // Total mail stats
    const [totalStats] = await db
      .select({
        total24h: sql<number>`COUNT(*) FILTER (WHERE created_at >= ${last24h})`,
        total7d: sql<number>`COUNT(*) FILTER (WHERE created_at >= ${last7d})`,
        outbound24h: sql<number>`COUNT(*) FILTER (WHERE direction = 'outbound' AND created_at >= ${last24h})`,
        inbound24h: sql<number>`COUNT(*) FILTER (WHERE direction = 'inbound' AND created_at >= ${last24h})`,
        bounced24h: sql<number>`COUNT(*) FILTER (WHERE status = 'bounced' AND created_at >= ${last24h})`,
        rejected24h: sql<number>`COUNT(*) FILTER (WHERE status = 'rejected' AND created_at >= ${last24h})`,
      })
      .from(mailLogs);

    // Postfix queue
    let queueSize = 0;
    try {
      const { stdout } = await execFileAsync("postqueue", ["-p"]);
      const match = stdout.match(/(\d+)\s+Request/);
      queueSize = match ? parseInt(match[1]) : 0;
    } catch {}

    return {
      rspamd: {
        scanned: rspamdStats["Messages scanned"] || "0",
        rejected: rspamdStats["Messages with action reject"] || "0",
        greylist: rspamdStats["Messages with action greylist"] || "0",
        spamRate: rspamdStats["Messages with action add header"] || "0",
      },
      stats: totalStats || {},
      queueSize,
      highVolumeSenders: highVolume,
      bouncedSenders: bounced,
      outboundByClient,
    };
  });

  // GET /api/admin/abuse/alerts — active alerts
  app.get("/alerts", async () => {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const alerts: Array<{ level: string; message: string; detail: string }> = [];

    // Check for high bounce rate per sender
    const bouncers = await db
      .select({
        fromAddress: mailLogs.fromAddress,
        total: sql<number>`COUNT(*)`,
        bounced: sql<number>`COUNT(*) FILTER (WHERE status = 'bounced')`,
      })
      .from(mailLogs)
      .where(and(eq(mailLogs.direction, "outbound"), gte(mailLogs.createdAt, last24h)))
      .groupBy(mailLogs.fromAddress)
      .having(sql`COUNT(*) > 5`);

    for (const b of bouncers) {
      const rate = b.total > 0 ? (b.bounced / b.total * 100) : 0;
      if (rate > 30) {
        alerts.push({
          level: rate > 50 ? "critical" : "warning",
          message: `High bounce rate: ${b.fromAddress}`,
          detail: `${b.bounced}/${b.total} emails bounced (${rate.toFixed(0)}%) in last 24h`,
        });
      }
    }

    // Check for high volume senders
    const volumeCheck = await db
      .select({
        fromAddress: mailLogs.fromAddress,
        count: sql<number>`COUNT(*)`,
      })
      .from(mailLogs)
      .where(and(eq(mailLogs.direction, "outbound"), gte(mailLogs.createdAt, last24h)))
      .groupBy(mailLogs.fromAddress)
      .having(sql`COUNT(*) > 200`);

    for (const v of volumeCheck) {
      alerts.push({
        level: v.count > 500 ? "critical" : "warning",
        message: `High volume sender: ${v.fromAddress}`,
        detail: `${v.count} emails sent in last 24h`,
      });
    }

    // Check queue size
    try {
      const { stdout } = await execFileAsync("postqueue", ["-p"]);
      const match = stdout.match(/(\d+)\s+Request/);
      const qSize = match ? parseInt(match[1]) : 0;
      if (qSize > 50) {
        alerts.push({ level: "warning", message: "Mail queue growing", detail: `${qSize} messages in queue` });
      }
    } catch {}

    return { alerts, count: alerts.length };
  });
}
