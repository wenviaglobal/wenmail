import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { platformSettings } from "../../db/schema.js";
import { env } from "../../config/env.js";

// Default settings — used when DB has no value yet
const DEFAULTS: Record<string, { value: string; label: string; group: string }> = {
  "server.hostname": { value: "mail.yourplatform.com", label: "Mail Server Hostname", group: "server" },
  "server.ip": { value: "", label: "Server Public IP", group: "server" },
  "server.webmail_url": { value: "", label: "Webmail URL (Roundcube)", group: "server" },
  "mail.postmaster_email": { value: "postmaster@yourplatform.com", label: "Postmaster Email", group: "mail" },
  "mail.dmarc_email": { value: "dmarc@yourplatform.com", label: "DMARC Report Email", group: "mail" },
  "mail.max_attachment_mb": { value: "25", label: "Max Attachment Size (MB)", group: "mail" },
  "branding.platform_name": { value: "MailPlatform", label: "Platform Name", group: "branding" },
  "branding.support_email": { value: "support@yourplatform.com", label: "Support Email", group: "branding" },
};

/**
 * Get a single setting value. Falls back to default, then env.
 */
export async function getSetting(key: string): Promise<string> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1);

  if (row) return row.value;
  if (DEFAULTS[key]) return DEFAULTS[key].value;
  if (key === "server.hostname") return env.PLATFORM_DOMAIN;
  return "";
}

/**
 * Get all settings as a flat object.
 */
export async function getAllSettings(): Promise<Record<string, { value: string; label: string; group: string }>> {
  const rows = await db.select().from(platformSettings);

  // Start with defaults, overlay with DB values
  const result: Record<string, { value: string; label: string; group: string }> = {};
  for (const [key, def] of Object.entries(DEFAULTS)) {
    result[key] = { ...def };
  }
  for (const row of rows) {
    result[row.key] = {
      value: row.value,
      label: row.label ?? row.key,
      group: row.group ?? "other",
    };
  }
  return result;
}

/**
 * Update one or more settings.
 */
export async function updateSettings(updates: Record<string, string>) {
  for (const [key, value] of Object.entries(updates)) {
    const def = DEFAULTS[key];
    await db
      .insert(platformSettings)
      .values({
        key,
        value,
        label: def?.label ?? key,
        group: def?.group ?? "other",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: platformSettings.key,
        set: { value, updatedAt: new Date() },
      });
  }
}

/**
 * Build DNS instructions for a specific domain using current platform settings.
 */
export async function buildDnsInstructions(domain: {
  domainName: string;
  verificationToken: string;
  dkimSelector: string | null;
  dkimPublicKey: string | null;
}) {
  const hostname = await getSetting("server.hostname");
  const serverIp = await getSetting("server.ip");
  const dmarcEmail = await getSetting("mail.dmarc_email");

  const dkimPub = domain.dkimPublicKey
    ? domain.dkimPublicKey
        .replace("-----BEGIN PUBLIC KEY-----", "")
        .replace("-----END PUBLIC KEY-----", "")
        .replace(/\s/g, "")
    : "";

  const mxValue = hostname;
  const selector = domain.dkimSelector ?? "mail";

  return {
    summary: {
      hostname,
      serverIp: serverIp || "(not configured yet — set in Admin > Settings)",
    },
    records: [
      {
        step: 1,
        purpose: "Verify domain ownership",
        type: "TXT",
        host: domain.domainName,
        hostHint: "@ or root",
        value: `mailplatform-verify=${domain.verificationToken}`,
        required: true,
      },
      {
        step: 2,
        purpose: "Route incoming email to our server",
        type: "MX",
        host: domain.domainName,
        hostHint: "@ or root",
        value: mxValue,
        priority: 10,
        required: true,
        note: serverIp ? `Server IP: ${serverIp}` : "Admin needs to configure server IP in Settings first",
      },
      {
        step: 3,
        purpose: "Authorize our server to send email for your domain (SPF)",
        type: "TXT",
        host: domain.domainName,
        hostHint: "@ or root",
        value: `v=spf1 ${serverIp ? `ip4:${serverIp} ` : ""}include:${hostname} ~all`,
        required: true,
      },
      {
        step: 4,
        purpose: "Email signature verification (DKIM)",
        type: "TXT",
        host: `${selector}._domainkey.${domain.domainName}`,
        hostHint: `${selector}._domainkey`,
        value: dkimPub ? `v=DKIM1; k=rsa; p=${dkimPub}` : "(DKIM key not generated)",
        required: true,
        note: "This is a long value — paste it exactly, some registrars split it into 255-char chunks automatically",
      },
      {
        step: 5,
        purpose: "Email authentication policy (DMARC)",
        type: "TXT",
        host: `_dmarc.${domain.domainName}`,
        hostHint: "_dmarc",
        value: `v=DMARC1; p=quarantine; rua=mailto:${dmarcEmail}`,
        required: true,
      },
    ],
  };
}
