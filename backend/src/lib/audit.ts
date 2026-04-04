import { db } from "../db/index.js";
import { auditLog } from "../db/schema.js";

/**
 * Log an admin or system action to the audit trail.
 * Non-blocking — errors are silently ignored.
 */
export function logAudit(params: {
  actorType: "admin" | "client" | "system";
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): void {
  db.insert(auditLog)
    .values({
      actorType: params.actorType,
      actorId: params.actorId ?? null,
      action: params.action,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      details: params.details ?? null,
      ipAddress: params.ipAddress ?? null,
    })
    .catch(() => {}); // Non-blocking, fire-and-forget
}
