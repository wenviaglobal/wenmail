import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { admins } from "../../db/schema.js";
import { authGuard } from "./auth.guard.js";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

export async function totpRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // POST /api/auth/totp/setup — generate secret + QR code
  app.post("/setup", async (request) => {
    const user = request.user as { id: string; email: string };

    const totp = new OTPAuth.TOTP({
      issuer: "WenMail",
      label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: new OTPAuth.Secret({ size: 20 }),
    });

    const uri = totp.toString();
    const qr = await QRCode.toDataURL(uri);

    // Save secret (not yet enabled)
    await db.update(admins).set({ totpSecret: totp.secret.base32 }).where(eq(admins.id, user.id));

    return { secret: totp.secret.base32, qrCode: qr, uri };
  });

  // POST /api/auth/totp/verify — verify code and enable 2FA
  app.post("/verify", async (request) => {
    const user = request.user as { id: string };
    const { code } = z.object({ code: z.string().length(6) }).parse(request.body);

    const [admin] = await db.select().from(admins).where(eq(admins.id, user.id)).limit(1);
    if (!admin?.totpSecret) return { valid: false, message: "2FA not set up" };

    const totp = new OTPAuth.TOTP({
      issuer: "WenMail", algorithm: "SHA1", digits: 6, period: 30,
      secret: OTPAuth.Secret.fromBase32(admin.totpSecret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) return { valid: false, message: "Invalid code" };

    await db.update(admins).set({ totpEnabled: true }).where(eq(admins.id, user.id));
    return { valid: true, message: "2FA enabled" };
  });

  // POST /api/auth/totp/disable — disable 2FA
  app.post("/disable", async (request) => {
    const user = request.user as { id: string };
    await db.update(admins).set({ totpEnabled: false, totpSecret: null }).where(eq(admins.id, user.id));
    return { message: "2FA disabled" };
  });

  // GET /api/auth/totp/status
  app.get("/status", async (request) => {
    const user = request.user as { id: string };
    const [admin] = await db.select({ totpEnabled: admins.totpEnabled }).from(admins).where(eq(admins.id, user.id)).limit(1);
    return { enabled: admin?.totpEnabled ?? false };
  });
}
