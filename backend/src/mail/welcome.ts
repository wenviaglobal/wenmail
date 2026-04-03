import { exec } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../lib/logger.js";
import { getSetting } from "../modules/settings/settings.service.js";

const execAsync = promisify(exec);

/**
 * Send a welcome email with IMAP/SMTP setup instructions to a newly created mailbox.
 */
export async function sendWelcomeEmail(email: string, displayName: string): Promise<void> {
  try {
    const hostname = await getSetting("server.hostname");
    const webmailUrl = await getSetting("server.webmail_url");
    const platformName = await getSetting("branding.platform_name");

    const name = displayName || email.split("@")[0];

    const body = `Subject: Welcome to ${platformName} - Your Email Setup Guide
From: noreply@${hostname.replace("mail.", "")}
To: ${email}
Content-Type: text/plain; charset=utf-8

Hi ${name},

Welcome to ${platformName}! Your email account ${email} is ready to use.

====================================
WEBMAIL (Browser Access)
====================================
URL:       ${webmailUrl}
Username:  ${email}
Password:  (the password you set during account creation)

====================================
IMAP Settings (Incoming Mail)
====================================
Server:    ${hostname}
Port:      993
Security:  SSL/TLS
Username:  ${email}

====================================
SMTP Settings (Outgoing Mail)
====================================
Server:    ${hostname}
Port:      587
Security:  STARTTLS
Username:  ${email}

====================================
SUPPORTED APPS
====================================
- Thunderbird (Desktop)
- Microsoft Outlook (Desktop/Mobile)
- Apple Mail (Mac/iPhone/iPad)
- Gmail App (Android/iOS) — Add account > Other
- Any app that supports IMAP/SMTP

Need help? Contact your administrator.

— ${platformName}
`;

    await execAsync(
      `echo ${JSON.stringify(body)} | sendmail -f noreply@${hostname.replace("mail.", "")} ${email}`,
    );
    logger.info({ email }, "Welcome email sent");
  } catch (err) {
    logger.warn({ email, err }, "Failed to send welcome email (non-fatal)");
  }
}
