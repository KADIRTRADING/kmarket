import "./testEnv.js";
import { describe, expect, it } from "vitest";
import { addMoney, applyPercentageDiscount, assertMoney, formatUzs, multiplyMoneyByQuantity, recomputeWeightedAverageCost, MoneyError } from "../src/lib/money.js";

describe("money helpers (integer-only UZS arithmetic, R13.1)", () => {
  it("rejects non-integer and negative amounts by default", () => {
    expect(() => assertMoney(100.5)).toThrow(MoneyError);
    expect(() => assertMoney(-100)).toThrow(MoneyError);
    expect(assertMoney(100)).toBe(100);
  });

  it("adds amounts as exact integers", () => {
    expect(addMoney(1000, 2000, 3000)).toBe(6000);
  });

  it("multiplies unit price by fractional quantity with exact rounding", () => {
    expect(multiplyMoneyByQuantity(10000, 1.5)).toBe(15000);
    expect(multiplyMoneyByQuantity(10000, 0.333)).toBe(3330);
  });

  it("applies a percentage discount using integer basis points", () => {
    expect(applyPercentageDiscount(100000, 10)).toBe(10000);
    expect(applyPercentageDiscount(100000, 12.5)).toBe(12500);
  });

  it("formats UZS with locale-appropriate suffix", () => {
    expect(formatUzs(1250000, "uz")).toBe("1 250 000 so'm");
    expect(formatUzs(1250000, "ru")).toBe("1 250 000 сум");
  });

  it("recomputes weighted-average cost correctly across receipts", () => {
    // 10 units @ 1000 existing, receive 10 units @ 2000 -> new avg should be 1500.
    expect(recomputeWeightedAverageCost(10, 1000, 10, 2000)).toBe(1500);
    // No existing stock: new cost becomes the incoming cost.
    expect(recomputeWeightedAverageCost(0, 0, 5, 3000)).toBe(3000);
  });
});
