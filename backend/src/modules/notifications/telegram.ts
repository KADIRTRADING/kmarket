import { pool } from "../../db/pool.js";
import { env } from "../../config/env.js";
import { decrypt } from "../../lib/crypto.js";
import type { CreateNotificationInput } from "./service.js";

/**
 * Best-effort Telegram delivery. Looks up a `telegram_configs` row scoped to the
 * store (or the platform-wide row when storeId is null), decrypts the bot token, and
 * calls the Telegram Bot API `sendMessage` method directly via fetch (no SDK
 * dependency needed for one call). Silently does nothing if TELEGRAM_ENABLED=false
 * or no config exists — this is optional infrastructure per R12.2.
 */
export async function dispatchTelegramNotification(input: CreateNotificationInput): Promise<void> {
  if (!env.TELEGRAM_ENABLED) return;

  const { rows } = await pool.query<{
    bot_token_ciphertext: string;
    bot_token_iv: string;
    chat_id: string;
    is_enabled: boolean;
  }>(
    `SELECT bot_token_ciphertext, bot_token_iv, chat_id, is_enabled FROM telegram_configs
     WHERE store_id ${input.storeId ? "= $1" : "IS NULL"} LIMIT 1`,
    input.storeId ? [input.storeId] : [],
  );
  const config = rows[0];
  if (!config || !config.is_enabled) return;

  const botToken = decrypt(config.bot_token_ciphertext, config.bot_token_iv);
  const text = `*${input.title}*\n${input.body}`;

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: config.chat_id, text, parse_mode: "Markdown" }),
  });

  if (!response.ok) {
    throw new Error(`Telegram API responded with ${response.status}`);
  }
}
