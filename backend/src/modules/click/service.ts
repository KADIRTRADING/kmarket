import { pool, withTransaction } from "../../db/pool.js";
import { NotFoundError, ValidationError, ConflictError } from "../../lib/errors.js";
import { getStoreClickCredentials, findStoreIdByServiceId } from "./credentials.js";
import { CLICK_ERROR, verifySignature, type ClickCompleteCallback, type ClickPrepareCallback } from "./clickClient.js";
import { finalizeClickPaidSale } from "../sales/service.js";
import { createNotification } from "../notifications/service.js";
import { env } from "../../config/env.js";

/**
 * Creates a PENDING click_transactions row linked to a sale, before redirecting the
 * customer to Click checkout (R8.2). In `CLICK_MODE=mock`, no real Click API call is
 * made — this function just creates the local pending record and returns a fake
 * "checkout URL" clearly marked as mock, for development/demo purposes (R8.7).
 */
export async function initiateClickPayment(storeId: string, saleId: string, amount: number): Promise<{ transactionId: string; checkoutUrl: string; isMock: boolean }> {
  const isMock = env.CLICK_MODE === "mock";
  const credentials = isMock ? null : await getStoreClickCredentials(storeId);

  const { rows } = await pool.query(
    `INSERT INTO click_transactions (store_id, sale_id, merchant_trans_id, amount, status, is_mock)
     VALUES ($1, $2, $3, $4, 'PENDING', $5)
     RETURNING id`,
    [storeId, saleId, saleId, amount, isMock],
  );
  const transactionId = rows[0].id;

  const checkoutUrl = isMock
    ? `https://mock.click.local/checkout?merchant_trans_id=${saleId}&amount=${amount}&mock=true`
    : `https://my.click.uz/services/pay?service_id=${credentials!.serviceId}&merchant_id=${credentials!.merchantId}&amount=${amount}&transaction_param=${saleId}`;

  return { transactionId, checkoutUrl, isMock };
}

interface ClickCallbackResponse {
  click_trans_id: string;
  merchant_trans_id: string;
  merchant_prepare_id?: string;
  merchant_confirm_id?: string;
  error: number;
  error_note: string;
}

/**
 * Handles Click's `Prepare` callback (R8.3). Verifies signature, merchant identity
 * (service_id must belong to a known store), and amount against the linked sale's
 * total, then transitions the local transaction to WAITING. Does NOT mark the sale
 * paid — only `Complete` does that (R8.4).
 */
export async function handleClickPrepare(payload: ClickPrepareCallback): Promise<ClickCallbackResponse> {
  const storeId = await findStoreIdByServiceId(payload.service_id);
  if (!storeId) {
    return respond(payload, CLICK_ERROR.USER_NOT_FOUND, "Merchant service not found");
  }

  const credentials = await getStoreClickCredentials(storeId).catch(() => null);
  const signatureValid = credentials ? verifySignature(payload, credentials.secretKey) : false;

  await logWebhookEvent(storeId, null, "PREPARE", payload, signatureValid);

  if (!signatureValid) {
    return respond(payload, CLICK_ERROR.SIGN_CHECK_FAILED, "Signature check failed");
  }

  const { rows: saleRows } = await pool.query<{ id: string; total: number; status: string }>(
    `SELECT id, total, status FROM sales WHERE id = $1 AND store_id = $2`,
    [payload.merchant_trans_id, storeId],
  );
  const sale = saleRows[0];
  if (!sale) {
    return respond(payload, CLICK_ERROR.TRANSACTION_NOT_FOUND, "Sale not found");
  }
  if (Number(payload.amount) !== sale.total) {
    return respond(payload, CLICK_ERROR.INCORRECT_AMOUNT, "Amount does not match sale total");
  }

  const existing = await pool.query(`SELECT * FROM click_transactions WHERE click_trans_id = $1`, [payload.click_trans_id]);
  if (existing.rows.length > 0) {
    // Idempotent: same click_trans_id seen before, return the same prepare id (R8.5).
    return respond(payload, CLICK_ERROR.SUCCESS, "OK", existing.rows[0].id);
  }

  await pool.query(
    `UPDATE click_transactions SET click_trans_id = $2, status = 'WAITING', prepared_at = now()
     WHERE store_id = $1 AND merchant_trans_id = $3 AND status = 'PENDING'`,
    [storeId, payload.click_trans_id, payload.merchant_trans_id],
  );

  const { rows: txRows } = await pool.query(`SELECT id FROM click_transactions WHERE click_trans_id = $1`, [payload.click_trans_id]);
  return respond(payload, CLICK_ERROR.SUCCESS, "OK", txRows[0]?.id);
}

/**
 * Handles Click's `Complete` callback (R8.4). On success (error=0), finalizes the
 * linked DRAFT sale — applying stock movements and posting the ledger entry — inside
 * one transaction. On cancellation (action=-1/-2), marks the transaction CANCELLED
 * without touching stock/ledger (none was applied yet, since Prepare never applies
 * business effects). Idempotent on click_trans_id (R8.5): a repeated Complete with
 * the same click_trans_id returns the same stored result without reprocessing.
 */
export async function handleClickComplete(payload: ClickCompleteCallback): Promise<ClickCallbackResponse> {
  const storeId = await findStoreIdByServiceId(payload.service_id);
  if (!storeId) {
    return respond(payload, CLICK_ERROR.USER_NOT_FOUND, "Merchant service not found");
  }

  const credentials = await getStoreClickCredentials(storeId).catch(() => null);
  const signatureValid = credentials ? verifySignature(payload, credentials.secretKey) : false;

  const { rows: txRows } = await pool.query(`SELECT * FROM click_transactions WHERE click_trans_id = $1`, [payload.click_trans_id]);
  const transaction = txRows[0];

  await logWebhookEvent(storeId, transaction?.id ?? null, "COMPLETE", payload, signatureValid);

  if (!signatureValid) {
    return respond(payload, CLICK_ERROR.SIGN_CHECK_FAILED, "Signature check failed");
  }
  if (!transaction) {
    return respond(payload, CLICK_ERROR.TRANSACTION_NOT_FOUND, "Transaction not found");
  }

  // Idempotency: already-processed terminal states return their stored outcome.
  if (transaction.status === "PAID") {
    return respond(payload, CLICK_ERROR.SUCCESS, "Already confirmed", undefined, transaction.id);
  }
  if (transaction.status === "CANCELLED") {
    return respond(payload, CLICK_ERROR.TRANSACTION_CANCELLED, "Already cancelled");
  }

  const isCancel = payload.action === "-1" || payload.action === "-2";
  if (isCancel) {
    await pool.query(`UPDATE click_transactions SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1`, [transaction.id]);
    return respond(payload, CLICK_ERROR.SUCCESS, "Cancelled", undefined, transaction.id);
  }

  if (Number(payload.amount) !== transaction.amount) {
    return respond(payload, CLICK_ERROR.INCORRECT_AMOUNT, "Amount mismatch");
  }

  try {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE click_transactions SET status = 'PAID', click_paydoc_id = $2, completed_at = now() WHERE id = $1`,
        [transaction.id, payload.click_paydoc_id],
      );
      await finalizeClickPaidSale(client, storeId, transaction.sale_id, transaction.amount);
    });
  } catch (err) {
    await createNotification({
      storeId, type: "PAYMENT_FAILED",
      title: "Click to'lovini yakunlashda xatolik",
      body: `Sale ${transaction.sale_id} uchun Click to'lovi tasdiqlangan, ammo tizimda yakunlashda xatolik yuz berdi.`,
      metadata: { saleId: transaction.sale_id, error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }

  return respond(payload, CLICK_ERROR.SUCCESS, "OK", undefined, transaction.id);
}

function respond(
  payload: ClickPrepareCallback,
  error: number,
  errorNote: string,
  merchantPrepareId?: string,
  merchantConfirmId?: string,
): ClickCallbackResponse {
  return {
    click_trans_id: payload.click_trans_id,
    merchant_trans_id: payload.merchant_trans_id,
    ...(merchantPrepareId ? { merchant_prepare_id: merchantPrepareId } : {}),
    ...(merchantConfirmId ? { merchant_confirm_id: merchantConfirmId } : {}),
    error,
    error_note: errorNote,
  };
}

async function logWebhookEvent(
  storeId: string,
  clickTransactionId: string | null,
  eventType: "PREPARE" | "COMPLETE",
  payload: unknown,
  signatureValid: boolean,
): Promise<void> {
  await pool.query(
    `INSERT INTO click_webhook_events (store_id, click_transaction_id, event_type, request_payload, response_payload, signature_valid)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [storeId, clickTransactionId, eventType, JSON.stringify(payload), JSON.stringify({}), signatureValid],
  );
}

export async function getClickTransactionsForStore(storeId: string) {
  const { rows } = await pool.query(`SELECT * FROM click_transactions WHERE store_id = $1 ORDER BY created_at DESC LIMIT 200`, [storeId]);
  return rows;
}

/**
 * Merchant-initiated refund. Click's reversal capability and exact endpoint depend
 * on your merchant contract type — see docs/click-integration.md. In mock mode this
 * simply marks the local transaction state; in live mode it MUST call Click's
 * documented reversal endpoint before considering the refund confirmed (not
 * implemented here pending real merchant contract details — see TODO in that doc).
 */
export async function refundClickTransaction(storeId: string, transactionId: string, reason: string): Promise<unknown> {
  const { rows } = await pool.query(`SELECT * FROM click_transactions WHERE id = $1 AND store_id = $2`, [transactionId, storeId]);
  const transaction = rows[0];
  if (!transaction) throw new NotFoundError("Click transaction not found");
  if (transaction.status !== "PAID") throw new ConflictError("Only PAID transactions can be refunded", "NOT_PAID");

  if (!transaction.is_mock) {
    throw new ValidationError(
      "Live Click refunds require calling Click's merchant reversal API with your specific merchant contract details, " +
      "which are not yet configured. See docs/click-integration.md.",
    );
  }

  await pool.query(`UPDATE click_transactions SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1`, [transactionId]);
  return { transactionId, status: "CANCELLED", note: "Mock refund processed", reason };
}
