import { pool } from "../../db/pool.js";
import { decrypt, encrypt } from "../../lib/crypto.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { env } from "../../config/env.js";

export interface StoreClickCredentials {
  merchantId: string;
  serviceId: string;
  merchantUserId: string;
  secretKey: string;
  isLive: boolean;
}

/** Stores a store's Click merchant credentials, encrypting the secret key at rest
 * (R8.1). Never returns the secret key back over the API — see routes.ts, which only
 * ever exposes merchantId/serviceId/merchantUserId/isLive for display. */
export async function saveStoreClickCredentials(
  storeId: string,
  input: { merchantId: string; serviceId: string; merchantUserId: string; secretKey: string; isLive: boolean },
): Promise<void> {
  const { ciphertext, iv } = encrypt(input.secretKey);
  await pool.query(
    `INSERT INTO store_click_credentials (store_id, merchant_id, service_id, merchant_user_id, secret_key_ciphertext, secret_key_iv, is_live)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (store_id) DO UPDATE SET
       merchant_id = $2, service_id = $3, merchant_user_id = $4, secret_key_ciphertext = $5, secret_key_iv = $6, is_live = $7, updated_at = now()`,
    [storeId, input.merchantId, input.serviceId, input.merchantUserId, ciphertext, iv, input.isLive],
  );
}

export async function getStoreClickCredentials(storeId: string): Promise<StoreClickCredentials> {
  const { rows } = await pool.query<{
    merchant_id: string; service_id: string; merchant_user_id: string;
    secret_key_ciphertext: string; secret_key_iv: string; is_live: boolean;
  }>(`SELECT * FROM store_click_credentials WHERE store_id = $1`, [storeId]);
  const row = rows[0];
  if (!row) throw new NotFoundError("Click credentials not configured for this store");
  return {
    merchantId: row.merchant_id,
    serviceId: row.service_id,
    merchantUserId: row.merchant_user_id,
    secretKey: decrypt(row.secret_key_ciphertext, row.secret_key_iv),
    isLive: row.is_live,
  };
}

export async function getStoreClickCredentialsSafe(storeId: string) {
  const { rows } = await pool.query<{ merchant_id: string; service_id: string; merchant_user_id: string; is_live: boolean; updated_at: string }>(
    `SELECT merchant_id, service_id, merchant_user_id, is_live, updated_at FROM store_click_credentials WHERE store_id = $1`,
    [storeId],
  );
  return rows[0] ?? null;
}

/** Looks up which store owns a given Click service_id (webhooks arrive without a
 * store_id in the URL, so we must resolve the store from service_id). */
export async function findStoreIdByServiceId(serviceId: string): Promise<string | null> {
  const { rows } = await pool.query<{ store_id: string }>(`SELECT store_id FROM store_click_credentials WHERE service_id = $1`, [serviceId]);
  return rows[0]?.store_id ?? null;
}

/**
 * Boot-time guard (R8.7): the backend refuses to start in CLICK_MODE=live unless at
 * least one store has real credentials configured. Called from server.ts.
 */
export async function assertClickBootConfigValid(): Promise<void> {
  if (env.CLICK_MODE !== "live") return;
  const { rows } = await pool.query<{ count: string }>(`SELECT count(*) FROM store_click_credentials WHERE is_live = true`);
  if (Number(rows[0]!.count) === 0) {
    throw new ValidationError(
      "CLICK_MODE=live but no store has live Click credentials configured. Refusing to boot in live mode with no real merchant configured.",
    );
  }
}
