import { resolve, resolveMx, resolveTxt } from "node:dns/promises";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { getSetting } from "../settings/settings.service.js";

export interface DnsCheckResult {
  type: "mx" | "spf" | "dkim" | "dmarc" | "verify";
  pass: boolean;
  raw: string;
}

/**
 * Verify domain ownership via TXT record.
 * Client must add: TXT "mailplatform-verify=<token>"
 */
export async function verifyDomainOwnership(
  domainName: string,
  expectedToken: string,
): Promise<DnsCheckResult> {
  try {
    const records = await resolveTxt(domainName);
    const flat = records.map((r) => r.join(""));
    const found = flat.find((r) => r === `mailplatform-verify=${expectedToken}`);
    return {
      type: "verify",
      pass: !!found,
      raw: JSON.stringify(flat),
    };
  } catch (err) {
    logger.warn({ domainName, err }, "DNS TXT lookup failed");
    return { type: "verify", pass: false, raw: String(err) };
  }
}

/**
 * Check if MX record points to our mail server.
 */
export async function checkMx(domainName: string): Promise<DnsCheckResult> {
  try {
    const hostname = await getSetting("server.hostname");
    const records = await resolveMx(domainName);
    const found = records.some(
      (r) => r.exchange.toLowerCase() === hostname.toLowerCase() ||
             r.exchange.toLowerCase() === env.PLATFORM_DOMAIN.toLowerCase(),
    );
    return {
      type: "mx",
      pass: found,
      raw: JSON.stringify(records),
    };
  } catch (err) {
    return { type: "mx", pass: false, raw: String(err) };
  }
}

/**
 * Check if SPF record includes our server (by hostname or IP).
 */
export async function checkSpf(domainName: string): Promise<DnsCheckResult> {
  try {
    const hostname = await getSetting("server.hostname");
    const serverIp = await getSetting("server.ip");
    const records = await resolveTxt(domainName);
    const flat = records.map((r) => r.join(""));
    const spf = flat.find((r) => r.startsWith("v=spf1"));
    const pass = !!spf && (
      spf.includes(hostname) ||
      spf.includes(env.PLATFORM_DOMAIN) ||
      (!!serverIp && spf.includes(serverIp))
    );
    return { type: "spf", pass, raw: spf || "no SPF record found" };
  } catch (err) {
    return { type: "spf", pass: false, raw: String(err) };
  }
}

/**
 * Check if DKIM record exists for the domain.
 */
export async function checkDkim(
  domainName: string,
  selector = "mail",
): Promise<DnsCheckResult> {
  try {
    const dkimDomain = `${selector}._domainkey.${domainName}`;
    const records = await resolveTxt(dkimDomain);
    const flat = records.map((r) => r.join(""));
    const found = flat.find((r) => r.includes("v=DKIM1"));
    return { type: "dkim", pass: !!found, raw: found || "no DKIM record found" };
  } catch (err) {
    return { type: "dkim", pass: false, raw: String(err) };
  }
}

/**
 * Check if DMARC record exists.
 */
export async function checkDmarc(domainName: string): Promise<DnsCheckResult> {
  try {
    const dmarcDomain = `_dmarc.${domainName}`;
    const records = await resolveTxt(dmarcDomain);
    const flat = records.map((r) => r.join(""));
    const found = flat.find((r) => r.startsWith("v=DMARC1"));
    return { type: "dmarc", pass: !!found, raw: found || "no DMARC record found" };
  } catch (err) {
    return { type: "dmarc", pass: false, raw: String(err) };
  }
}

/**
 * Run all DNS checks for a domain.
 */
export async function checkAllDns(
  domainName: string,
  verificationToken: string,
  dkimSelector = "mail",
): Promise<DnsCheckResult[]> {
  const results = await Promise.all([
    verifyDomainOwnership(domainName, verificationToken),
    checkMx(domainName),
    checkSpf(domainName),
    checkDkim(domainName, dkimSelector),
    checkDmarc(domainName),
  ]);
  return results;
}
