import type { PoolClient } from "pg";
import { pool } from "../../db/pool.js";

export type FinancialEntryType =
  | "SALE_REVENUE" | "SALE_RETURN" | "EXPENSE" | "INCOME" | "CASH_IN" | "CASH_OUT"
  | "SUPPLIER_PAYMENT" | "STOCK_WRITE_OFF" | "PURCHASE_COST" | "REVERSAL";

export interface PostLedgerEntryInput {
  storeId: string;
  branchId?: string;
  entryType: FinancialEntryType;
  amount: number; // signed UZS
  paymentMethod?: "CASH" | "CLICK" | "OTHER";
  sourceType: string;
  sourceId: string;
  occurredAt?: Date;
}

/**
 * The single function that writes to `ledger_entries` (design.md §12 canonical trace
 * table, R10.3). Every module with a financial effect calls this — inside the SAME
 * transaction as the source record — so every report figure can be traced back to
 * exactly one row here.
 */
export async function postLedgerEntry(client: PoolClient | typeof pool, input: PostLedgerEntryInput): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO ledger_entries (store_id, branch_id, entry_type, amount, payment_method, source_type, source_id, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, now()))
     RETURNING id`,
    [
      input.storeId,
      input.branchId ?? null,
      input.entryType,
      input.amount,
      input.paymentMethod ?? null,
      input.sourceType,
      input.sourceId,
      input.occurredAt ?? null,
    ],
  );
  return rows[0]!.id;
}
