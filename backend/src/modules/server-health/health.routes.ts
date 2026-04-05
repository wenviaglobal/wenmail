import type { FastifyInstance } from "fastify";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir } from "node:fs/promises";
import os from "node:os";
import { sql } from "drizzle-orm";
import { authGuard } from "../auth/auth.guard.js";
import { db } from "../../db/index.js";
import { redis } from "../../lib/redis.js";

const execAsync = promisify(exec);

export async function serverHealthRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // GET /api/admin/server/health — full system overview
  app.get("/health", async () => {
    const [system, database, redisInfo, mail, disk, security] = await Promise.all([
      getSystemInfo(),
      getDatabaseInfo(),
      getRedisInfo(),
      getMailServiceStatus(),
      getDiskUsage(),
      getSecurityInfo(),
    ]);

    return { system, database, redis: redisInfo, mail, disk, security, timestamp: new Date().toISOString() };
  });

  // GET /api/admin/server/metrics — lightweight for polling
  app.get("/metrics", async () => {
    const mem = process.memoryUsage();
    const load = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return {
      cpu: { loadAvg1m: load[0], loadAvg5m: load[1], loadAvg15m: load[2], cores: os.cpus().length },
      memory: { totalMb: Math.round(totalMem / 1048576), usedMb: Math.round((totalMem - freeMem) / 1048576), freePercent: Math.round((freeMem / totalMem) * 100) },
      process: { heapMb: Math.round(mem.heapUsed / 1048576), rssMb: Math.round(mem.rss / 1048576), uptime: Math.round(process.uptime()) },
      timestamp: new Date().toISOString(),
    };
  });
}

async function getSystemInfo() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const cpus = os.cpus();

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    uptime: os.uptime(),
    cpu: {
      model: cpus[0]?.model ?? "unknown",
      cores: cpus.length,
      loadAvg: os.loadavg(),
    },
    memory: {
      totalGb: +(totalMem / 1073741824).toFixed(2),
      usedGb: +((totalMem - freeMem) / 1073741824).toFixed(2),
      freeGb: +(freeMem / 1073741824).toFixed(2),
      usedPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
    },
  };
}

async function getDatabaseInfo() {
  try {
    const start = Date.now();
    const [result] = await db.execute(sql`SELECT pg_database_size(current_database()) as db_size`);
    const latency = Date.now() - start;

    const [connResult] = await db.execute(
      sql`SELECT count(*) as active FROM pg_stat_activity WHERE state = 'active'`,
    );

    return {
      status: "healthy",
      latencyMs: latency,
      sizeGb: +((result as any).db_size / 1073741824).toFixed(3),
      activeConnections: Number((connResult as any).active),
    };
  } catch (err) {
    return { status: "unhealthy", error: String(err) };
  }
}

async function getRedisInfo() {
  try {
    const start = Date.now();
    await redis.ping();
    const latency = Date.now() - start;

    const info = await redis.info("memory");
    const usedMatch = info.match(/used_memory_human:(\S+)/);
    const peakMatch = info.match(/used_memory_peak_human:(\S+)/);

    const keyspace = await redis.info("keyspace");
    const keysMatch = keyspace.match(/keys=(\d+)/);

    return {
      status: "healthy",
      latencyMs: latency,
      usedMemory: usedMatch?.[1] ?? "unknown",
      peakMemory: peakMatch?.[1] ?? "unknown",
      totalKeys: keysMatch ? parseInt(keysMatch[1]) : 0,
    };
  } catch (err) {
    return { status: "unhealthy", error: String(err) };
  }
}

async function getMailServiceStatus() {
  const services: Record<string, { status: string; details?: string }> = {};

  for (const svc of ["postfix", "dovecot", "rspamd"]) {
    try {
      const { stdout } = await execAsync(`systemctl is-active ${svc} 2>/dev/null || echo "inactive"`);
      const status = stdout.trim();
      services[svc] = { status: status === "active" ? "running" : "stopped", details: status };
    } catch {
      services[svc] = { status: "unknown", details: "Cannot check (dev mode or no systemd)" };
    }
  }

  // Check mail queue
  try {
    const { stdout } = await execAsync("postqueue -p 2>/dev/null | tail -1 || echo '0'");
    const match = stdout.match(/(\d+)\s+Request/);
    services.mailQueue = { status: "info", details: `${match?.[1] ?? 0} messages in queue` };
  } catch {
    services.mailQueue = { status: "unknown", details: "Cannot check mail queue" };
  }

  return services;
}

async function getDiskUsage() {
  try {
    const { stdout } = await execAsync("df -h / /var/mail 2>/dev/null || df -h /");
    const lines = stdout.trim().split("\n").slice(1);
    return lines.map((line) => {
      const parts = line.split(/\s+/);
      return {
        filesystem: parts[0],
        size: parts[1],
        used: parts[2],
        available: parts[3],
        usePercent: parts[4],
        mountedOn: parts[5],
      };
    });
  } catch {
    return [{ filesystem: "unknown", size: "N/A", used: "N/A", available: "N/A", usePercent: "N/A", mountedOn: "/" }];
  }
}

const execFileAsync = promisify(execFile);

async function getSecurityInfo() {
  const result: any = { rspamd: {}, fail2ban: {}, ssl: [], imapConnections: 0 };

  // Rspamd stats
  try {
    const { stdout } = await execFileAsync("rspamc", ["stat"]);
    const lines = stdout.split("\n");
    for (const line of lines) {
      const m = line.match(/^(.+?):\s+(.+)$/);
      if (m) {
        const key = m[1].trim();
        if (key === "Messages scanned") result.rspamd.scanned = m[2].trim();
        if (key.includes("action reject")) result.rspamd.rejected = m[2].trim();
        if (key.includes("action greylist")) result.rspamd.greylisted = m[2].trim();
        if (key.includes("action add header")) result.rspamd.spamTagged = m[2].trim();
        if (key.includes("action rewrite")) result.rspamd.rewritten = m[2].trim();
      }
    }
  } catch {}

  // Fail2ban
  try {
    const { stdout } = await execAsync("fail2ban-client status 2>/dev/null");
    const jailMatch = stdout.match(/Jail list:\s+(.+)/);
    const jails = jailMatch ? jailMatch[1].split(",").map(j => j.trim()) : [];
    result.fail2ban.jails = jails;
    result.fail2ban.totalBanned = 0;
    for (const jail of jails) {
      try {
        const { stdout: js } = await execAsync(`fail2ban-client status ${jail} 2>/dev/null`);
        const bannedMatch = js.match(/Currently banned:\s+(\d+)/);
        const banned = bannedMatch ? parseInt(bannedMatch[1]) : 0;
        result.fail2ban.totalBanned += banned;
      } catch {}
    }
  } catch { result.fail2ban = { jails: [], totalBanned: 0 }; }

  // SSL certificate expiry
  try {
    const { stdout } = await execAsync("certbot certificates 2>/dev/null");
    const certs = stdout.split("Certificate Name:").slice(1);
    for (const cert of certs) {
      const nameMatch = cert.match(/^\s*(.+)/);
      const expiryMatch = cert.match(/Expiry Date:\s*(\S+ \S+)/);
      if (nameMatch && expiryMatch) {
        const expiry = new Date(expiryMatch[1]);
        const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        result.ssl.push({
          domain: nameMatch[1].trim(),
          expiry: expiryMatch[1],
          daysLeft,
          status: daysLeft > 30 ? "ok" : daysLeft > 7 ? "warning" : "critical",
        });
      }
    }
  } catch {}

  // Active IMAP connections
  try {
    const { stdout } = await execAsync("doveadm who 2>/dev/null | wc -l");
    result.imapConnections = Math.max(0, parseInt(stdout.trim()) - 1); // subtract header
  } catch {}

  return result;
}
