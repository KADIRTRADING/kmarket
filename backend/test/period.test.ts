import "./testEnv.js";
import { describe, expect, it } from "vitest";
import { resolvePeriod } from "../src/lib/period.js";

describe("period resolution (Asia/Tashkent, UTC+5, R11.3)", () => {
  it("resolves 'today' as a 24h window and 'yesterday' as the preceding 24h window", () => {
    const today = resolvePeriod("today");
    const yesterday = resolvePeriod("yesterday");

    expect(today.end.getTime() - today.start.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(yesterday.end.getTime()).toBe(today.start.getTime());
  });

  it("resolves 'this_week' to start on Monday Tashkent time", () => {
    const thisWeek = resolvePeriod("this_week");
    const tashkentStart = new Date(thisWeek.start.getTime() + 5 * 60 * 60 * 1000);
    expect(tashkentStart.getUTCDay()).toBe(1); // Monday
  });

  it("resolves a custom range inclusively and computes an equal-length previous period", () => {
    const custom = resolvePeriod("custom", "2026-01-10", "2026-01-12");
    const days = (custom.end.getTime() - custom.start.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(3); // Jan 10, 11, 12 inclusive
    const prevDays = (custom.previous.end.getTime() - custom.previous.start.getTime()) / (24 * 60 * 60 * 1000);
    expect(prevDays).toBe(3);
    expect(custom.previous.end.getTime()).toBe(custom.start.getTime());
  });

  it("resolves 'this_month' and 'last_month' as non-overlapping adjacent ranges", () => {
    const thisMonth = resolvePeriod("this_month");
    const lastMonth = resolvePeriod("last_month");
    expect(lastMonth.end.getTime()).toBe(thisMonth.start.getTime());
  });
});
