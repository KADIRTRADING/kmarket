/**
 * Money helpers — the ONLY place monetary arithmetic should happen in this codebase.
 *
 * Invariant (R13.1): UZS amounts are always whole integers (there is no practical
 * minor unit in day-to-day Uzbek retail commerce). We represent them as JS `number`
 * only at the API boundary (JSON has no bigint) but validate on the way in that the
 * value is a safe, non-negative (unless explicitly allowed) integer, and we NEVER
 * perform division that can produce a fractional so'm without explicit, documented
 * rounding. Internally, sums accumulate as JS integers (safe up to 2^53-1, far beyond
 * any real store's transaction volume) — never `Number` arithmetic mixed with
 * fractional operands, and never a `float`/`double` DB column.
 */

export class MoneyError extends Error {}

/** Asserts a value is a valid UZS integer amount. Throws MoneyError otherwise. */
export function assertMoney(value: unknown, opts: { allowNegative?: boolean; allowZero?: boolean } = {}): number {
  if (typeof value !== "number" || !Number.isInteger(value) || !Number.isFinite(value)) {
    throw new MoneyError(`Invalid money amount: ${String(value)} (must be an integer UZS value)`);
  }
  if (!opts.allowNegative && value < 0) {
    throw new MoneyError(`Money amount must not be negative: ${value}`);
  }
  if (!opts.allowZero && value === 0 && !opts.allowNegative) {
    // Zero is allowed in most contexts (e.g. discount_total); callers that truly
    // require a positive amount (payments) should pass allowZero: false explicitly
    // AND check value > 0 themselves. This helper does not reject zero by default.
  }
  return value;
}

export function addMoney(...amounts: number[]): number {
  return amounts.reduce((sum, a) => {
    assertMoney(a, { allowNegative: true });
    return sum + a;
  }, 0);
}

export function subtractMoney(a: number, b: number): number {
  assertMoney(a, { allowNegative: true });
  assertMoney(b, { allowNegative: true });
  return a - b;
}

/**
 * Multiply a UZS unit price (integer) by a quantity that may have up to 3 decimal
 * places (e.g. 1.250 kg). Result is rounded to the nearest whole so'm using
 * round-half-up, applied exactly once at the point of sale — never compounded.
 */
export function multiplyMoneyByQuantity(unitPriceUzs: number, quantity: number): number {
  assertMoney(unitPriceUzs);
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0) {
    throw new MoneyError(`Invalid quantity: ${String(quantity)}`);
  }
  // Work in integer "milli-units" of quantity to avoid binary float drift, then round.
  const milliQty = Math.round(quantity * 1000);
  const totalMilli = unitPriceUzs * milliQty; // integer * integer = exact
  return Math.round(totalMilli / 1000);
}

/** Applies a percentage discount (0-100, up to 2 decimals) to a UZS amount, rounded. */
export function applyPercentageDiscount(amountUzs: number, percent: number): number {
  assertMoney(amountUzs);
  if (typeof percent !== "number" || percent < 0 || percent > 100) {
    throw new MoneyError(`Invalid discount percent: ${String(percent)}`);
  }
  const basisPoints = Math.round(percent * 100); // integer, 0-10000
  return Math.round((amountUzs * basisPoints) / 10000);
}

/** Formats an integer UZS amount for display, e.g. 1250000 -> "1 250 000 so'm". */
export function formatUzs(amountUzs: number, locale: "uz" | "ru" = "uz"): string {
  assertMoney(amountUzs, { allowNegative: true });
  const abs = Math.abs(amountUzs);
  // Group digits with a plain ASCII space every 3 digits. Deliberately not using
  // `toLocaleString` here: locale-aware grouping (e.g. "ru-RU") inserts a Unicode
  // non-breaking space (U+00A0), which looks identical to a normal space in most UIs
  // but is a different character — surprising for exact-string comparisons/tests and
  // for any downstream text processing. Plain regex grouping keeps the output
  // byte-for-byte predictable across Node versions/ICU data.
  const digits = String(abs);
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const sign = amountUzs < 0 ? "-" : "";
  const suffix = locale === "ru" ? "сум" : "so'm";
  return `${sign}${grouped} ${suffix}`;
}

/** Weighted-average cost recompute: (oldQty*oldAvg + newQty*newCost) / (oldQty+newQty). */
export function recomputeWeightedAverageCost(
  currentQuantity: number,
  currentAvgCostUzs: number,
  incomingQuantity: number,
  incomingUnitCostUzs: number,
): number {
  assertMoney(currentAvgCostUzs);
  assertMoney(incomingUnitCostUzs);
  const totalQty = currentQuantity + incomingQuantity;
  if (totalQty <= 0) return incomingUnitCostUzs;
  const totalValueMilli = Math.round(currentQuantity * 1000) * currentAvgCostUzs
    + Math.round(incomingQuantity * 1000) * incomingUnitCostUzs;
  const totalQtyMilli = Math.round(totalQty * 1000);
  return Math.round(totalValueMilli / totalQtyMilli);
}
