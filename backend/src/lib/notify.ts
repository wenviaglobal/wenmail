import { db } from "../db/index.js";
import { notifications } from "../db/schema.js";
import { and, eq } from "drizzle-orm";

/**
 * Create a notification. Fire-and-forget.
 */
export function notify(params: {
  targetType: "admin" | "client";
  targetId?: string;
  type: string;
  title: string;
  message?: string;
  actionUrl?: string;
  actionLabel?: string;
  severity?: "info" | "warning" | "critical";
  metadata?: Record<string, unknown>;
}): void {
  db.insert(notifications).values({
    targetType: params.targetType,
    targetId: params.targetId ?? null,
    type: params.type,
    title: params.title,
    message: params.message ?? null,
    actionUrl: params.actionUrl ?? null,
    actionLabel: params.actionLabel ?? null,
    severity: params.severity ?? "info",
    metadata: params.metadata ?? null,
  }).catch(() => {});
}

/**
 * Notify all admins (targetId = null means all admins).
 */
export function notifyAdmin(type: string, title: string, opts?: {
  message?: string; actionUrl?: string; actionLabel?: string; severity?: "info" | "warning" | "critical"; metadata?: Record<string, unknown>;
}): void {
  notify({ targetType: "admin", type, title, ...opts });
}

/**
 * Notify a specific client.
 */
export function notifyClient(clientId: string, type: string, title: string, opts?: {
  message?: string; actionUrl?: string; actionLabel?: string; severity?: "info" | "warning" | "critical"; metadata?: Record<string, unknown>;
}): void {
  notify({ targetType: "client", targetId: clientId, type, title, ...opts });
}
