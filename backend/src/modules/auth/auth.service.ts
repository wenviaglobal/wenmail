import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { admins } from "../../db/schema.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { AppError } from "../../lib/errors.js";

export async function authenticateAdmin(email: string, password: string) {
  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.email, email.toLowerCase()))
    .limit(1);

  if (!admin) {
    throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }

  const valid = await verifyPassword(admin.passwordHash, password);
  if (!valid) {
    throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }

  return { id: admin.id, email: admin.email, role: admin.role };
}

export async function createAdmin(email: string, password: string, role = "admin") {
  const passwordHash = await hashPassword(password);
  const [admin] = await db
    .insert(admins)
    .values({ email: email.toLowerCase(), passwordHash, role })
    .returning({ id: admins.id, email: admins.email, role: admins.role });
  return admin;
}
