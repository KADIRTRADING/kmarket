import { createHash } from "node:crypto";
import { env } from "../../config/env.js";

/**
 * Click Business merchant API signature helpers, following Click's documented
 * "Merchant API" callback protocol (Prepare/Complete via MD5 signature). See
 * docs/click-integration.md for the exact field list and links to Click's official
 * documentation, and for what you must obtain from Click Business to go live.
 *
 * IMPORTANT: this module implements SIGNATURE VERIFICATION for INCOMING Click
 * callbacks (the flow actually exercised in this delivery's mock/test mode) and a
 * thin outbound "create invoice" client stub. Click's exact outbound invoice-
 * creation endpoint/contract can vary by merchant contract type (Checkout vs
 * Shop API); the outbound call is intentionally isolated behind `ClickApiClient` so
 * it can be adapted to your specific merchant contract once issued, without
 * touching webhook verification or ledger logic.
 */

export interface ClickPrepareCallback {
  click_trans_id: string;
  service_id: string;
  merchant_trans_id: string;
  merchant_prepare_id?: string;
  amount: string;
  action: string; // "0" = Prepare
  error: string;
  error_note: string;
  sign_time: string;
  sign_string: string;
}

export interface ClickCompleteCallback extends ClickPrepareCallback {
  click_paydoc_id: string;
  merchant_confirm_id?: string;
}

/**
 * Click's documented sign_string algorithm for Prepare:
 *   MD5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + amount + action + sign_time)
 * and for Complete (adds merchant_prepare_id before amount):
 *   MD5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
 *
 * This matches the field order published in Click's merchant API integration guide.
 * Verify this exact order against your merchant contract documentation before going
 * live — Click has historically used this order for Prepare/Complete callbacks.
 */
export function buildSignString(params: {
  clickTransId: string;
  serviceId: string;
  secretKey: string;
  merchantTransId: string;
  merchantPrepareId?: string;
  amount: string;
  action: string;
  signTime: string;
}): string {
  const parts = [
    params.clickTransId,
    params.serviceId,
    params.secretKey,
    params.merchantTransId,
    ...(params.merchantPrepareId !== undefined ? [params.merchantPrepareId] : []),
    params.amount,
    params.action,
    params.signTime,
  ];
  return createHash("md5").update(parts.join("")).digest("hex");
}

export function verifySignature(
  callback: ClickPrepareCallback | ClickCompleteCallback,
  secretKey: string,
): boolean {
  const merchantPrepareId = "merchant_prepare_id" in callback ? callback.merchant_prepare_id : undefined;
  const expected = buildSignString({
    clickTransId: callback.click_trans_id,
    serviceId: callback.service_id,
    secretKey,
    merchantTransId: callback.merchant_trans_id,
    merchantPrepareId,
    amount: callback.amount,
    action: callback.action,
    signTime: callback.sign_time,
  });
  return expected === callback.sign_string;
}

/** Click's standard callback error codes (subset relevant to our handling). */
export const CLICK_ERROR = {
  SUCCESS: 0,
  SIGN_CHECK_FAILED: -1,
  INCORRECT_AMOUNT: -2,
  ACTION_NOT_FOUND: -3,
  ALREADY_PAID: -4,
  USER_NOT_FOUND: -5,
  TRANSACTION_NOT_FOUND: -6,
  BAD_REQUEST: -8,
  TRANSACTION_CANCELLED: -9,
} as const;

export function isLiveModeConfigured(): boolean {
  return env.CLICK_MODE === "live";
}
