import { pool } from "../../db/pool.js";
import { dispatchTelegramNotification } from "./telegram.js";

export interface CreateNotificationInput {
  storeId?: string | null;
  recipientStoreUserId?: string | null;
  recipientPlatformUserId?: string | null;
  type:
    | "LOW_STOCK"
    | "OUT_OF_STOCK"
    | "STORE_PENDING_APPROVAL"
    | "STORE_APPROVED"
    | "STORE_REJECTED"
    | "STORE_SUSPENDED"
    | "PAYMENT_FAILED"
    | "CASH_DISCREPANCY"
    | "SYSTEM_ERROR"
    | "INVENTORY_COUNT_DISCREPANCY";
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

/**
 * Creates an in-app notification row and, best-effort, forwards it to Telegram if a
 * config exists for the store (or platform-wide for store_id = null). Telegram
 * failures are logged and never throw — they must not block the underlying business
 * operation that triggered the notification (R12.2, design.md §11).
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (store_id, recipient_store_user_id, recipient_platform_user_id, type, title, body, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.storeId ?? null,
      input.recipientStoreUserId ?? null,
      input.recipientPlatformUserId ?? null,
      input.type,
      input.title,
      input.body,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  try {
    await dispatchTelegramNotification(input);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications] Telegram dispatch failed (non-fatal):", err);
  }
}

export async function listNotifications(
  target: { storeUserId?: string; platformUserId?: string; storeId?: string },
  since?: Date,
) {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (target.storeUserId) {
    params.push(target.storeUserId);
    conditions.push(`(recipient_store_user_id = $${params.length} OR (recipient_store_user_id IS NULL AND store_id = (SELECT store_id FROM store_users WHERE id = $${params.length})))`);
  }
  if (target.platformUserId) {
    params.push(target.platformUserId);
    conditions.push(`recipient_platform_user_id = $${params.length}`);
  }
  if (since) {
    params.push(since.toISOString());
    conditions.push(`created_at > $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(`SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT 200`, params);
  return rows;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await pool.query(`UPDATE notifications SET is_read = true WHERE id = $1`, [notificationId]);
}
