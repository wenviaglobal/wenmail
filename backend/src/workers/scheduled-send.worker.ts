import { Worker } from "bullmq";
import { createTransport } from "nodemailer";
import { lte, eq, and } from "drizzle-orm";
import { redis } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { db } from "../db/index.js";
import { scheduledEmails } from "../db/schema.js";

/**
 * Scheduled email worker — runs every minute, sends pending scheduled emails.
 */
export function createScheduledSendWorker() {
  return new Worker(
    "scheduled-send",
    async () => {
      const now = new Date();
      const pending = await db.select().from(scheduledEmails)
        .where(and(eq(scheduledEmails.status, "pending"), lte(scheduledEmails.scheduledAt, now)));

      for (const email of pending) {
        try {
          // We need the user's password to send via SMTP — but we don't store it
          // So we send via local Postfix (no auth needed for localhost submission)
          const transporter = createTransport({ host: "127.0.0.1", port: 25, secure: false, tls: { rejectUnauthorized: false } });

          const mailOptions: any = {
            from: email.senderEmail, to: email.toAddresses, subject: email.subject,
            text: email.textBody || "", html: email.htmlBody || undefined,
            cc: email.ccAddresses || undefined, bcc: email.bccAddresses || undefined,
          };

          if (email.attachmentsJson) {
            try {
              const atts = JSON.parse(email.attachmentsJson);
              mailOptions.attachments = atts.map((a: any) => ({
                filename: a.filename, content: Buffer.from(a.content, "base64"), contentType: a.contentType,
              }));
            } catch {}
          }

          await transporter.sendMail(mailOptions);
          await db.update(scheduledEmails).set({ status: "sent", sentAt: new Date() }).where(eq(scheduledEmails.id, email.id));
          logger.info({ to: email.toAddresses, subject: email.subject }, "Scheduled email sent");
        } catch (err: any) {
          await db.update(scheduledEmails).set({ status: "failed", error: err.message?.substring(0, 500) }).where(eq(scheduledEmails.id, email.id));
          logger.error({ id: email.id, err: err.message }, "Scheduled email failed");
        }
      }
    },
    { connection: redis, concurrency: 1 },
  );
}
